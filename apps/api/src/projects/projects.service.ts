import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import {
  PLAN_LABEL_ES,
  PLAN_LIMITS,
  planIncludesFullAnalysis,
  type SubscriptionPlan,
} from "@devai-factory/shared-types";
import { TenantPrismaService } from "../prisma/tenant-prisma.service";
import { ClaudeClient } from "../orchestrator/claude-client";
import { runIntakeStage } from "../orchestrator/stages/intake.stage";
import { runClarificationQuestionsStage } from "../orchestrator/stages/clarification-questions.stage";
import { questionsMessage, userMessage, type IntakeMessage } from "../orchestrator/intake-messages";
import { GENERATION_QUEUE } from "../orchestrator/orchestrator.constants";
import type { GenerationJobData } from "../orchestrator/generation.processor";
import { CreateProjectDto } from "./dto/create-project.dto";
import { CreateQuickStoryDto } from "./dto/create-quick-story.dto";
import { AnswerIntakeDto } from "./dto/answer-intake.dto";
import { UpdateRequirementDto } from "./dto/update-requirement.dto";
import { UpdateUserStoryDto } from "./dto/update-user-story.dto";
import { UpdateTestCaseDto } from "./dto/update-test-case.dto";

function generateJobId(projectId: string) {
  return `generate-${projectId}`;
}

@Injectable()
export class ProjectsService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly claude: ClaudeClient,
    @InjectQueue(GENERATION_QUEUE) private readonly generationQueue: Queue<GenerationJobData>,
  ) {}

  /**
   * Toda organización nueva arranca sin suscripción activa (ver el default
   * en el schema) — no puede crear ni generar proyectos hasta que Stripe
   * confirme un pago o el super-admin la active manualmente desde su panel.
   * El frontend ya la confina a /dashboard/billing, pero esto es lo que de
   * verdad impide consumir el servicio si alguien llama a la API sin pasar
   * por esa pantalla.
   */
  private async assertSubscriptionActive(orgId: string) {
    const db = this.tenant.client;
    const org = await db.organization.findUniqueOrThrow({ where: { id: orgId }, select: { subscriptionActive: true } });
    if (!org.subscriptionActive) {
      throw new ForbiddenException(
        "Tu organización todavía no tiene una suscripción activa. Elige un plan en Facturación o contacta al equipo de Qubit.",
      );
    }
  }

  private async assertProjectQuota(orgId: string) {
    const db = this.tenant.client;
    const org = await db.organization.findUniqueOrThrow({ where: { id: orgId }, select: { plan: true } });
    const limits = PLAN_LIMITS[org.plan as SubscriptionPlan];
    if (limits.maxProjectsPerMonth == null) return;

    const periodStart = new Date();
    periodStart.setDate(1);
    periodStart.setHours(0, 0, 0, 0);

    const projectsThisMonth = await db.project.count({
      where: { orgId, createdAt: { gte: periodStart } },
    });

    if (projectsThisMonth >= limits.maxProjectsPerMonth) {
      throw new ForbiddenException(
        `Alcanzaste el límite de ${limits.maxProjectsPerMonth} análisis este mes en tu plan ${PLAN_LABEL_ES[org.plan as SubscriptionPlan]}. Mejora tu plan para crear más proyectos.`,
      );
    }
  }

  /**
   * El módulo "Análisis completo" es un beneficio de los planes Team y
   * Empresa — Starter queda limitado al módulo "Historia de usuario". Se
   * revisa tanto al crear el proyecto como al (re)generarlo, por si la
   * organización bajó de plan entre una cosa y otra.
   */
  private async assertPlanAllowsFullAnalysis(orgId: string) {
    const db = this.tenant.client;
    const org = await db.organization.findUniqueOrThrow({ where: { id: orgId }, select: { plan: true } });
    if (!planIncludesFullAnalysis(org.plan as SubscriptionPlan)) {
      throw new ForbiddenException(
        `El análisis completo no está incluido en el plan ${PLAN_LABEL_ES[org.plan as SubscriptionPlan]}. Mejora tu plan en Facturación, o usa el módulo de historia de usuario individual.`,
      );
    }
  }

  /**
   * El módulo "Historia de usuario" está habilitado por defecto para todo
   * usuario de cualquier plan — el super-admin es quien lo desactiva,
   * persona por persona, nunca por organización completa.
   */
  private async assertSingleStoryEnabled(userId: string) {
    const db = this.tenant.client;
    const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { singleStoryEnabled: true } });
    if (!user.singleStoryEnabled) {
      throw new ForbiddenException(
        "Tu acceso al módulo de historia de usuario individual fue desactivado por un administrador. Contacta al equipo de Qubit.",
      );
    }
  }

  /** Módulo "Análisis completo": descripción -> preguntas de aclaración -> paquete completo. */
  async create(dto: CreateProjectDto) {
    const { orgId, userId } = this.tenant.currentUser;
    const db = this.tenant.client;

    await this.assertSubscriptionActive(orgId);
    await this.assertPlanAllowsFullAnalysis(orgId);
    await this.assertProjectQuota(orgId);

    const project = await db.project.create({
      data: { orgId, name: dto.name, createdBy: userId, status: "intake", storiesOnly: false },
    });

    const intakeResult = await runIntakeStage(this.claude, dto.description);
    const questionsResult = await runClarificationQuestionsStage(
      this.claude,
      dto.description,
      intakeResult.data,
    );

    const messages: IntakeMessage[] = [
      userMessage(dto.description),
      questionsMessage(questionsResult.data.questions),
    ];

    await db.$transaction(async (tx) => {
      await tx.project.update({ where: { id: project.id }, data: { domain: intakeResult.data.domain } });
      await tx.intakeSession.create({
        data: { projectId: project.id, messages: messages as unknown as object[], status: "awaiting_answers" },
      });
      await tx.usageEvent.createMany({
        data: [
          {
            orgId,
            projectId: project.id,
            tokensIn: intakeResult.tokensIn,
            tokensOut: intakeResult.tokensOut,
            stage: "intake",
          },
          {
            orgId,
            projectId: project.id,
            tokensIn: questionsResult.tokensIn,
            tokensOut: questionsResult.tokensOut,
            stage: "clarification_questions",
          },
        ],
      });
    });

    return this.findOne(project.id);
  }

  /**
   * Módulo "Historia de usuario": título + descripción -> exactamente una
   * historia, sin ronda de preguntas de aclaración — es el flujo liviano,
   * a propósito distinto del análisis completo. El proyecto arranca
   * directo en "ready_to_generate", listo para que el usuario dispare
   * /generate cuando quiera.
   */
  async createQuickStory(dto: CreateQuickStoryDto) {
    const { orgId, userId } = this.tenant.currentUser;
    const db = this.tenant.client;

    await this.assertSubscriptionActive(orgId);
    await this.assertSingleStoryEnabled(userId);
    await this.assertProjectQuota(orgId);

    const project = await db.project.create({
      data: { orgId, name: dto.title, createdBy: userId, status: "ready_to_generate", storiesOnly: true },
    });

    const intakeResult = await runIntakeStage(this.claude, dto.description);

    await db.$transaction(async (tx) => {
      await tx.project.update({ where: { id: project.id }, data: { domain: intakeResult.data.domain } });
      await tx.intakeSession.create({
        data: {
          projectId: project.id,
          messages: [userMessage(dto.description)] as unknown as object[],
          status: "answered",
        },
      });
      await tx.usageEvent.create({
        data: {
          orgId,
          projectId: project.id,
          tokensIn: intakeResult.tokensIn,
          tokensOut: intakeResult.tokensOut,
          stage: "intake",
        },
      });
    });

    return this.findOne(project.id);
  }

  findAll(storiesOnly?: boolean) {
    return this.tenant.client.project.findMany({
      where: storiesOnly === undefined ? undefined : { storiesOnly },
      orderBy: { createdAt: "desc" },
    });
  }

  async findOne(id: string) {
    const project = await this.tenant.client.project.findUnique({ where: { id } });
    if (!project) {
      throw new NotFoundException("Proyecto no encontrado");
    }
    return project;
  }

  async getIntake(projectId: string) {
    await this.findOne(projectId);
    const session = await this.tenant.client.intakeSession.findFirst({
      where: { projectId },
      orderBy: { createdAt: "desc" },
    });
    return session;
  }

  async answerIntake(projectId: string, dto: AnswerIntakeDto) {
    const project = await this.findOne(projectId);
    if (project.status !== "intake") {
      throw new BadRequestException("Este proyecto ya no está esperando respuestas de aclaración");
    }
    // El estado "intake" solo existe para proyectos de análisis completo
    // (los de historia de usuario arrancan directo en "ready_to_generate" y
    // nunca pasan por aquí) — pero si la organización bajó de plan después
    // de crear el proyecto, no debe poder seguir avanzándolo. Se revisa en
    // cada respuesta, no solo al crear, para que un downgrade a mitad de
    // camino corte el flujo de inmediato.
    const { orgId } = this.tenant.currentUser;
    await this.assertSubscriptionActive(orgId);
    await this.assertPlanAllowsFullAnalysis(orgId);
    const session = await this.tenant.client.intakeSession.findFirst({
      where: { projectId },
      orderBy: { createdAt: "desc" },
    });
    if (!session) {
      throw new NotFoundException("No hay una sesión de intake para este proyecto");
    }

    const messages = (session.messages as unknown as IntakeMessage[]) ?? [];
    messages.push(userMessage(dto.answers.join("\n"), { answers: dto.answers }));

    await this.tenant.client.$transaction(async (tx) => {
      await tx.intakeSession.update({
        where: { id: session.id },
        data: { messages: messages as unknown as object[], status: "answered" },
      });
      await tx.project.update({
        where: { id: projectId },
        data: { status: "ready_to_generate" },
      });
    });

    return this.findOne(projectId);
  }

  private async assertGenerationQuota(orgId: string) {
    const db = this.tenant.client;
    const org = await db.organization.findUniqueOrThrow({ where: { id: orgId }, select: { plan: true } });
    const limits = PLAN_LIMITS[org.plan as SubscriptionPlan];
    if (limits.maxGenerationsPerMonth == null) return;

    const periodStart = new Date();
    periodStart.setDate(1);
    periodStart.setHours(0, 0, 0, 0);

    const generationsThisMonth = await db.generationRun.count({
      where: { orgId, createdAt: { gte: periodStart } },
    });

    if (generationsThisMonth >= limits.maxGenerationsPerMonth) {
      throw new ForbiddenException(
        `Alcanzaste el límite de ${limits.maxGenerationsPerMonth} generaciones (incluye regeneraciones) este mes en tu plan ${PLAN_LABEL_ES[org.plan as SubscriptionPlan]}. Mejora tu plan para seguir generando.`,
      );
    }
  }

  async triggerGenerate(projectId: string) {
    const project = await this.findOne(projectId);
    // "generating" es una entrada válida además de las otras tres: si el
    // worker o Redis se cayeron a mitad de una corrida, el proyecto queda
    // atascado en "generating" para siempre sin esto — el remove()-y-add()
    // de abajo ya limpia cualquier job huérfano antes de encolar uno nuevo.
    if (
      project.status !== "ready_to_generate" &&
      project.status !== "generated" &&
      project.status !== "failed" &&
      project.status !== "generating"
    ) {
      throw new BadRequestException(
        "El proyecto debe haber respondido las preguntas de aclaración antes de generar requerimientos",
      );
    }

    const { orgId } = this.tenant.currentUser;
    await this.assertSubscriptionActive(orgId);
    if (!project.storiesOnly) {
      await this.assertPlanAllowsFullAnalysis(orgId);
    } else {
      await this.assertSingleStoryEnabled(this.tenant.currentUser.userId);
    }
    await this.assertGenerationQuota(orgId);

    await this.tenant.client.project.update({ where: { id: projectId }, data: { status: "generating" } });
    await this.tenant.client.generationRun.create({ data: { orgId, projectId } });

    // BullMQ treats a re-added job with the same custom id as a no-op (it
    // won't re-run) — remove any leftover job from a previous run/failure
    // for this project before enqueuing, so "regenerar" actually re-runs.
    const jobId = generateJobId(projectId);
    const existingJob = await this.generationQueue.getJob(jobId);
    if (existingJob) {
      await existingJob.remove();
    }

    await this.generationQueue.add(
      "generate-requirements",
      { projectId, orgId: this.tenant.currentUser.orgId },
      { jobId, removeOnComplete: true, removeOnFail: 50 },
    );

    return { status: "generating" };
  }

  async getGenerateStatus(projectId: string) {
    const project = await this.findOne(projectId);
    const job = await this.generationQueue.getJob(generateJobId(projectId));
    const progress = job ? await job.progress : project.status === "generated" ? 100 : 0;
    return {
      projectStatus: project.status,
      progress: typeof progress === "number" ? progress : 0,
      failedReason: job?.failedReason,
    };
  }

  async listRequirements(projectId: string) {
    await this.findOne(projectId);
    return this.tenant.client.requirement.findMany({
      where: { projectId },
      orderBy: { code: "asc" },
    });
  }

  async updateRequirement(id: string, dto: UpdateRequirementDto) {
    const existing = await this.tenant.client.requirement.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("Requerimiento no encontrado");
    }
    return this.tenant.client.requirement.update({ where: { id }, data: dto });
  }

  async listUserStories(projectId: string) {
    await this.findOne(projectId);
    return this.tenant.client.userStory.findMany({
      where: { projectId },
      include: { acceptanceCriteria: true, requirement: { select: { code: true, title: true } } },
      orderBy: { code: "asc" },
    });
  }

  async updateUserStory(id: string, dto: UpdateUserStoryDto) {
    const existing = await this.tenant.client.userStory.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("Historia de usuario no encontrada");
    }
    return this.tenant.client.userStory.update({ where: { id }, data: dto });
  }

  async listDataModel(projectId: string) {
    await this.findOne(projectId);
    return this.tenant.client.dataModelEntity.findMany({ where: { projectId }, orderBy: { name: "asc" } });
  }

  async listApiEndpoints(projectId: string) {
    await this.findOne(projectId);
    return this.tenant.client.apiEndpoint.findMany({ where: { projectId }, orderBy: { path: "asc" } });
  }

  async listTestCases(projectId: string) {
    await this.findOne(projectId);
    return this.tenant.client.testCase.findMany({
      where: { projectId },
      include: { acceptanceCriterion: { include: { userStory: { select: { code: true, actor: true, goal: true } } } } },
      orderBy: { code: "asc" },
    });
  }

  async updateTestCase(id: string, dto: UpdateTestCaseDto) {
    const existing = await this.tenant.client.testCase.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("Caso de prueba no encontrado");
    }
    return this.tenant.client.testCase.update({
      where: { id },
      data: { ...dto, steps: dto.steps as unknown as object[] | undefined },
    });
  }
}
