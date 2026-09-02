import { Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { getDomainGuidance } from "@devai-factory/domain-templates";
import { PrismaService } from "../prisma/prisma.service";
import { ClaudeClient } from "./claude-client";
import { runRequirementsStage } from "./stages/requirements.stage";
import { runUserStoriesStage } from "./stages/user-stories.stage";
import { runSingleUserStoryStage } from "./stages/single-user-story.stage";
import { runDataModelStage } from "./stages/data-model.stage";
import { runTestCasesStage } from "./stages/test-cases.stage";
import { buildQaText, type IntakeMessage } from "./intake-messages";
import { GENERATION_QUEUE } from "./orchestrator.constants";

export interface GenerationJobData {
  projectId: string;
  orgId: string;
}

interface GenerationContext {
  projectId: string;
  orgId: string;
  description: string;
  qaText: string;
  domainGuidance: string;
}

function padCode(prefix: string, i: number) {
  return `${prefix}-${String(i + 1).padStart(3, "0")}`;
}

@Processor(GENERATION_QUEUE)
export class GenerationProcessor extends WorkerHost {
  private readonly logger = new Logger(GenerationProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly claude: ClaudeClient,
  ) {
    super();
  }

  async process(job: Job<GenerationJobData>): Promise<void> {
    const { projectId, orgId } = job.data;
    const db = this.prisma.forOrg(orgId);

    try {
      await job.updateProgress(5);

      const project = await db.project.findUniqueOrThrow({ where: { id: projectId } });
      // La elección de modo queda fija en el proyecto desde su creación
      // (ProjectsService.create la valida contra el flag de la organización
      // en ese momento) — una regeneración respeta esa elección aunque el
      // super-admin haya cambiado el flag de la organización después.
      const storiesOnly = project.storiesOnly;
      const intakeSession = await db.intakeSession.findFirst({
        where: { projectId },
        orderBy: { createdAt: "desc" },
      });
      const messages = (intakeSession?.messages ?? []) as unknown as IntakeMessage[];
      const qaText = buildQaText(messages);
      const description = messages[0]?.content ?? project.name;
      const domainGuidance = getDomainGuidance(project.domain);

      // Clear any previous generation output before regenerating. Deleting
      // requirements cascades to user_stories -> acceptance_criteria ->
      // test_cases (FKs are onDelete: Cascade); data model / API endpoints
      // are project-scoped, so they need an explicit delete.
      await db.$transaction(async (tx) => {
        await tx.requirement.deleteMany({ where: { projectId } });
        await tx.dataModelEntity.deleteMany({ where: { projectId } });
        await tx.apiEndpoint.deleteMany({ where: { projectId } });
      });

      const ctx: GenerationContext = { projectId, orgId, description, qaText, domainGuidance };

      if (storiesOnly) {
        await this.processSingleStory(db, job, ctx);
      } else {
        await this.processFullPackage(db, job, ctx);
      }

      await db.project.update({ where: { id: projectId }, data: { status: "generated" } });
      await job.updateProgress(100);
    } catch (error) {
      this.logger.error(`Falló la generación del proyecto ${projectId}`, error as Error);
      await db.project.update({ where: { id: projectId }, data: { status: "failed" } });
      throw error;
    }
  }

  /**
   * Modo "solo historias de usuario": el cliente describió UNA necesidad
   * puntual (no un sistema completo) y espera exactamente UNA historia de
   * usuario detallada para eso — nunca una descomposición en varios
   * requerimientos con una historia cada uno, que es el modo de paquete
   * completo. Se crea un único Requirement como contenedor mínimo (el
   * esquema exige que toda historia tenga un requerimiento padre) que
   * simplemente refleja la misma historia, nunca una lista de sub-partes.
   */
  private async processSingleStory(
    db: ReturnType<PrismaService["forOrg"]>,
    job: Job<GenerationJobData>,
    ctx: GenerationContext,
  ): Promise<void> {
    const { projectId, orgId, description, qaText, domainGuidance } = ctx;

    const storyResult = await runSingleUserStoryStage(this.claude, { description, qaText, domainGuidance });
    await job.updateProgress(60);

    await db.$transaction(async (tx) => {
      const draft = storyResult.data;
      const requirement = await tx.requirement.create({
        data: {
          projectId,
          code: "REQ-001",
          title: draft.title,
          description: `El sistema deberá permitir ${draft.goal} para que ${draft.benefit}.`,
          type: "functional",
          priority: draft.priority,
          actor: draft.actor,
          acceptanceCriteria: draft.acceptanceCriteria.map((ac) => ({
            given: ac.given,
            when: ac.when,
            then: ac.then,
          })),
          businessRules: null,
          dependencies: draft.dependencies || null,
          assumptions: null,
          status: "draft",
        },
      });

      await tx.userStory.create({
        data: {
          projectId,
          requirementId: requirement.id,
          code: "HU-001",
          title: draft.title,
          actor: draft.actor,
          goal: draft.goal,
          benefit: draft.benefit,
          priority: draft.priority,
          storyPoints: draft.storyPoints,
          dependencies: draft.dependencies || null,
          definitionOfReady: draft.definitionOfReady,
          definitionOfDone: draft.definitionOfDone,
          acceptanceCriteria: {
            create: draft.acceptanceCriteria.map((ac) => ({
              scenarioName: ac.scenarioName,
              given: ac.given,
              when: ac.when,
              then: ac.then,
            })),
          },
        },
      });

      await tx.usageEvent.create({
        data: {
          orgId,
          projectId,
          tokensIn: storyResult.tokensIn,
          tokensOut: storyResult.tokensOut,
          stage: "single_user_story",
        },
      });
    });
  }

  /** Modo paquete completo: requerimientos, historias, modelo de datos, API y casos de prueba. */
  private async processFullPackage(
    db: ReturnType<PrismaService["forOrg"]>,
    job: Job<GenerationJobData>,
    ctx: GenerationContext,
  ): Promise<void> {
    const { projectId, orgId, description, qaText, domainGuidance } = ctx;

    // --- Etapa: requerimientos ----------------------------------------
    const reqResult = await runRequirementsStage(this.claude, { description, qaText, domainGuidance });
    await job.updateProgress(25);

    const requirementRows = await db.$transaction(async (tx) => {
      for (const [i, req] of reqResult.data.requirements.entries()) {
        await tx.requirement.create({
          data: {
            projectId,
            code: padCode("REQ", i),
            title: req.title,
            description: req.description,
            type: req.type,
            priority: req.priority,
            actor: req.actor,
            acceptanceCriteria: req.acceptanceCriteria as unknown as object[],
            businessRules: req.businessRules || null,
            dependencies: req.dependencies || null,
            assumptions: req.assumptions || null,
            status: "draft",
          },
        });
      }
      await tx.usageEvent.create({
        data: { orgId, projectId, tokensIn: reqResult.tokensIn, tokensOut: reqResult.tokensOut, stage: "requirements" },
      });
      return tx.requirement.findMany({ where: { projectId }, orderBy: { code: "asc" } });
    });
    const codeToRequirementId = new Map(requirementRows.map((r) => [r.code, r.id]));

    // --- Etapa: historias de usuario + criterios de aceptación --------
    const toStoryInput = (r: (typeof requirementRows)[number]) => ({
      code: r.code,
      title: r.title,
      description: r.description,
      type: r.type,
      priority: r.priority,
    });
    const storiesResult = await runUserStoriesStage(this.claude, requirementRows.map(toStoryInput));

    // Red de seguridad: el cliente paga por un paquete completo, así que un
    // requerimiento sin su historia no es aceptable aunque el prompt ya lo
    // pida explícitamente. Si el modelo omitió alguno, se le vuelve a pedir
    // solo por los que faltan y se combinan los resultados.
    const missingReqs = requirementRows.filter(
      (r) => !storiesResult.data.stories.some((s) => s.requirementCode === r.code),
    );
    if (missingReqs.length > 0) {
      this.logger.warn(
        `${missingReqs.length} requerimiento(s) sin historia tras el primer intento — generando las que faltan`,
      );
      const followUp = await runUserStoriesStage(this.claude, missingReqs.map(toStoryInput));
      storiesResult.data.stories.push(...followUp.data.stories);
      storiesResult.tokensIn += followUp.tokensIn;
      storiesResult.tokensOut += followUp.tokensOut;
    }
    await job.updateProgress(45);

    const flatCriteria: { ref: string; id: string; given: string; when: string; then: string }[] = [];
    await db.$transaction(async (tx) => {
      let acCounter = 0;
      let storyIndex = 0;
      for (const storyDraft of storiesResult.data.stories) {
        const requirementId = codeToRequirementId.get(storyDraft.requirementCode);
        if (!requirementId) {
          this.logger.warn(`Historia con código de requerimiento desconocido: ${storyDraft.requirementCode}`);
          continue;
        }
        const story = await tx.userStory.create({
          data: {
            projectId,
            requirementId,
            code: padCode("HU", storyIndex),
            title: storyDraft.title,
            actor: storyDraft.actor,
            goal: storyDraft.goal,
            benefit: storyDraft.benefit,
            priority: storyDraft.priority,
            storyPoints: storyDraft.storyPoints,
            dependencies: storyDraft.dependencies || null,
            definitionOfReady: storyDraft.definitionOfReady,
            definitionOfDone: storyDraft.definitionOfDone,
            acceptanceCriteria: {
              create: storyDraft.acceptanceCriteria.map((ac) => ({
                scenarioName: ac.scenarioName,
                given: ac.given,
                when: ac.when,
                then: ac.then,
              })),
            },
          },
          include: { acceptanceCriteria: true },
        });
        storyIndex += 1;
        for (const ac of story.acceptanceCriteria) {
          acCounter += 1;
          flatCriteria.push({ ref: `AC-${acCounter}`, id: ac.id, given: ac.given, when: ac.when, then: ac.then });
        }
      }
      await tx.usageEvent.create({
        data: { orgId, projectId, tokensIn: storiesResult.tokensIn, tokensOut: storiesResult.tokensOut, stage: "user_stories" },
      });
    });

    // --- Etapas en paralelo: modelo de datos + API, y casos de prueba -----
    // Ninguna de las dos depende de la salida de la otra (ambas solo
    // necesitan los requerimientos y las historias ya generadas), así que
    // correrlas en paralelo en vez de en secuencia recorta buena parte del
    // tiempo total de espera del cliente.
    await job.updateProgress(55);
    const [dataModelResult, testCasesResult] = await Promise.all([
      runDataModelStage(this.claude, {
        requirements: requirementRows.map((r) => ({ code: r.code, title: r.title, description: r.description })),
        stories: storiesResult.data.stories.map((s) => ({ actor: s.actor, goal: s.goal, benefit: s.benefit })),
        domainGuidance,
      }),
      flatCriteria.length > 0 ? runTestCasesStage(this.claude, flatCriteria) : Promise.resolve(null),
    ]);
    await job.updateProgress(80);

    await db.$transaction(async (tx) => {
      await tx.dataModelEntity.createMany({
        data: dataModelResult.data.entities.map((e) => ({
          projectId,
          name: e.name,
          fields: e.fields as unknown as object[],
          relations: e.relations as unknown as object[],
        })),
      });
      await tx.apiEndpoint.createMany({
        data: dataModelResult.data.endpoints.map((e) => ({
          projectId,
          method: e.method,
          path: e.path,
          description: e.description,
        })),
      });
      await tx.usageEvent.create({
        data: { orgId, projectId, tokensIn: dataModelResult.tokensIn, tokensOut: dataModelResult.tokensOut, stage: "data_model_api" },
      });
    });

    // --- Etapa: casos de prueba ------------------------------------------
    let testCaseCount = 0;
    if (testCasesResult) {
      await db.$transaction(async (tx) => {
        const refToCriterion = new Map(flatCriteria.map((c) => [c.ref, c.id]));
        let tcIndex = 0;
        for (const tc of testCasesResult.data.testCases) {
          const acceptanceCriteriaId = refToCriterion.get(tc.criterionRef);
          if (!acceptanceCriteriaId) {
            this.logger.warn(`Caso de prueba con referencia de criterio desconocida: ${tc.criterionRef}`);
            continue;
          }
          await tx.testCase.create({
            data: {
              projectId,
              acceptanceCriteriaId,
              code: padCode("CP", tcIndex),
              title: tc.title,
              type: tc.type,
              precondition: tc.precondition,
              steps: tc.steps as unknown as object[],
              testData: tc.testData,
              expectedResult: tc.expectedResult,
              severity: tc.severity,
              status: "not_executed",
            },
          });
          tcIndex += 1;
          testCaseCount += 1;
        }
        await tx.usageEvent.create({
          data: { orgId, projectId, tokensIn: testCasesResult.tokensIn, tokensOut: testCasesResult.tokensOut, stage: "test_cases" },
        });
      });
    }

    // --- Validación de trazabilidad (no bloqueante) --------------------
    const requirementsWithoutStory = requirementRows.filter(
      (r) => !storiesResult.data.stories.some((s) => s.requirementCode === r.code),
    ).length;
    if (requirementsWithoutStory > 0) {
      this.logger.warn(`${requirementsWithoutStory} requerimiento(s) sin historia de usuario asociada`);
    }
    if (testCaseCount < flatCriteria.length) {
      this.logger.warn(
        `${flatCriteria.length - testCaseCount} criterio(s) de aceptación sin caso de prueba asociado`,
      );
    }
  }
}
