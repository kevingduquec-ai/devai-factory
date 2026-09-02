import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import type { IntegrationConnection } from "@prisma/client";
import { TenantPrismaService } from "../prisma/tenant-prisma.service";
import { encryptSecret, decryptSecret } from "../common/crypto";
import { getProviderAdapter, ProviderAuthError, ProviderRequestError } from "./providers";
import type { ProviderCredentials } from "./providers/provider.types";
import { ConnectIntegrationDto } from "./dto/connect-integration.dto";
import { SelectTargetDto } from "./dto/select-target.dto";
import { TriggerSyncDto } from "./dto/trigger-sync.dto";
import { SYNC_QUEUE } from "./integrations.constants";
import type { SyncJobData } from "./sync.processor";

function syncJobId(syncRunId: string) {
  return `sync-${syncRunId}`;
}

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly tenant: TenantPrismaService,
    @InjectQueue(SYNC_QUEUE) private readonly syncQueue: Queue<SyncJobData>,
  ) {}

  /**
   * Add-on desactivado por defecto (a diferencia de "Historia de usuario")
   * — es el super-admin quien lo enciende persona por persona, nunca un
   * beneficio automático de ningún plan. Ver User.integrationsEnabled.
   */
  private async assertIntegrationsEnabled(userId: string) {
    const db = this.tenant.client;
    const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { integrationsEnabled: true } });
    if (!user.integrationsEnabled) {
      throw new ForbiddenException(
        "El módulo de integración con Jira/ClickUp no está activo en tu cuenta. Contacta al equipo de Qubit para activarlo.",
      );
    }
  }

  private async assertSubscriptionActive(orgId: string) {
    const db = this.tenant.client;
    const org = await db.organization.findUniqueOrThrow({ where: { id: orgId }, select: { subscriptionActive: true } });
    if (!org.subscriptionActive) {
      throw new ForbiddenException("Tu organización todavía no tiene una suscripción activa.");
    }
  }

  private sanitize(connection: IntegrationConnection) {
    const { encryptedToken: _encryptedToken, ...rest } = connection;
    return rest;
  }

  private credsFor(connection: IntegrationConnection): ProviderCredentials {
    return {
      siteUrl: connection.siteUrl,
      authEmail: connection.authEmail,
      apiToken: decryptSecret(connection.encryptedToken),
    };
  }

  private friendlyProviderError(error: unknown): never {
    if (error instanceof ProviderAuthError) {
      throw new BadRequestException(`No se pudo autenticar con las credenciales dadas: ${error.message}`);
    }
    if (error instanceof ProviderRequestError) {
      throw new BadRequestException(`La API respondió con un error: ${error.message}`);
    }
    throw new BadRequestException(error instanceof Error ? error.message : "Error inesperado al conectar");
  }

  async listConnections() {
    const { orgId, userId } = this.tenant.currentUser;
    await this.assertIntegrationsEnabled(userId);
    const connections = await this.tenant.client.integrationConnection.findMany({
      where: { orgId },
      orderBy: { createdAt: "desc" },
    });
    return connections.map((c) => this.sanitize(c));
  }

  /** Onboarding paso 1: valida credenciales y descubre los destinos disponibles (Capa 2 + 3). */
  async connect(dto: ConnectIntegrationDto) {
    const { orgId, userId } = this.tenant.currentUser;
    await this.assertSubscriptionActive(orgId);
    await this.assertIntegrationsEnabled(userId);

    if (dto.provider === "jira" && (!dto.siteUrl || !dto.authEmail)) {
      throw new BadRequestException("Jira necesita la URL del sitio y el correo asociado al API token");
    }

    const adapter = getProviderAdapter(dto.provider);
    const creds: ProviderCredentials = {
      siteUrl: dto.siteUrl ?? null,
      authEmail: dto.authEmail ?? null,
      apiToken: dto.apiToken,
    };

    try {
      await adapter.testConnection(creds);
      const structure = await adapter.discoverStructure(creds);

      const connection = await this.tenant.client.integrationConnection.create({
        data: {
          orgId,
          provider: dto.provider,
          label: dto.label,
          siteUrl: dto.siteUrl ?? null,
          authEmail: dto.authEmail ?? null,
          encryptedToken: encryptSecret(dto.apiToken),
          status: "active",
          structureSnapshot: structure.raw as object,
          createdBy: userId,
        },
      });

      return { connection: this.sanitize(connection), targets: structure.targets };
    } catch (error) {
      this.friendlyProviderError(error);
    }
  }

  private async loadOwnedConnection(id: string): Promise<IntegrationConnection> {
    const connection = await this.tenant.client.integrationConnection.findUnique({ where: { id } });
    if (!connection) {
      throw new NotFoundException("Conexión no encontrada");
    }
    return connection;
  }

  /** Vuelve a consultar los destinos disponibles (proyectos/listas) sin perder la conexión ni el mapeo ya confirmado. */
  async rediscover(connectionId: string) {
    const { userId } = this.tenant.currentUser;
    await this.assertIntegrationsEnabled(userId);
    const connection = await this.loadOwnedConnection(connectionId);
    const adapter = getProviderAdapter(connection.provider);
    try {
      const structure = await adapter.discoverStructure(this.credsFor(connection));
      const updated = await this.tenant.client.integrationConnection.update({
        where: { id: connectionId },
        data: { structureSnapshot: structure.raw as object, status: "active" },
      });
      return { connection: this.sanitize(updated), targets: structure.targets };
    } catch (error) {
      if (error instanceof ProviderAuthError) {
        await this.tenant.client.integrationConnection.update({ where: { id: connectionId }, data: { status: "expired" } });
      }
      this.friendlyProviderError(error);
    }
  }

  /**
   * Onboarding paso 2: el cliente eligió un proyecto de Jira / lista de
   * ClickUp concreto — se detecta su estructura de campos y se arma el
   * mapeo heurístico sugerido (Capa 4), todavía sin confirmar.
   */
  async selectTarget(connectionId: string, dto: SelectTargetDto) {
    const { userId } = this.tenant.currentUser;
    await this.assertIntegrationsEnabled(userId);
    const connection = await this.loadOwnedConnection(connectionId);
    const adapter = getProviderAdapter(connection.provider);
    try {
      const detail = await adapter.discoverTargetDetail(this.credsFor(connection), dto.targetId);
      const updated = await this.tenant.client.integrationConnection.update({
        where: { id: connectionId },
        data: {
          targetId: dto.targetId,
          targetLabel: dto.targetLabel,
          mapping: detail.mapping as unknown as object,
          mappingConfirmed: false,
          status: "active",
        },
      });
      return { connection: this.sanitize(updated), suggestedMapping: detail.mapping };
    } catch (error) {
      this.friendlyProviderError(error);
    }
  }

  /** Onboarding paso 3: el cliente confirma el mapeo sugerido — a partir de aquí la conexión queda lista para enviar contenido. */
  async confirmMapping(connectionId: string) {
    const { userId } = this.tenant.currentUser;
    await this.assertIntegrationsEnabled(userId);
    const connection = await this.loadOwnedConnection(connectionId);
    if (!connection.targetId || !connection.mapping) {
      throw new BadRequestException("Primero elige un destino (proyecto/lista) antes de confirmar el mapeo");
    }
    const updated = await this.tenant.client.integrationConnection.update({
      where: { id: connectionId },
      data: { mappingConfirmed: true },
    });
    return this.sanitize(updated);
  }

  async disconnect(connectionId: string) {
    const { userId } = this.tenant.currentUser;
    await this.assertIntegrationsEnabled(userId);
    await this.loadOwnedConnection(connectionId);
    await this.tenant.client.integrationConnection.delete({ where: { id: connectionId } });
    return { deleted: true };
  }

  /** Dispara un envío (Capa 5/6) — el trabajo real corre en segundo plano vía BullMQ, ver SyncProcessor. */
  async triggerSync(projectId: string, dto: TriggerSyncDto) {
    const { orgId, userId } = this.tenant.currentUser;
    await this.assertSubscriptionActive(orgId);
    await this.assertIntegrationsEnabled(userId);

    const project = await this.tenant.client.project.findUnique({ where: { id: projectId } });
    if (!project) {
      throw new NotFoundException("Proyecto no encontrado");
    }
    if (project.status !== "generated") {
      throw new BadRequestException("El proyecto todavía no tiene contenido generado para enviar");
    }

    const connection = await this.loadOwnedConnection(dto.connectionId);
    if (connection.status !== "active") {
      throw new BadRequestException("Esta conexión no está activa — reconéctala antes de enviar.");
    }
    if (!connection.targetId || !connection.mappingConfirmed) {
      throw new BadRequestException("Esta conexión todavía no tiene un destino y un mapeo confirmados.");
    }

    const syncRun = await this.tenant.client.syncRun.create({
      data: {
        orgId,
        connectionId: connection.id,
        projectId,
        sourceType: project.storiesOnly ? "single_story" : "full_study",
        status: "in_progress",
        triggeredBy: userId,
      },
    });

    await this.syncQueue.add(
      "sync-project",
      { syncRunId: syncRun.id, orgId },
      { jobId: syncJobId(syncRun.id), removeOnComplete: true, removeOnFail: 50 },
    );

    return syncRun;
  }

  async listSyncRuns(projectId: string) {
    return this.tenant.client.syncRun.findMany({
      where: { projectId },
      include: { items: true, connection: { select: { provider: true, label: true } } },
      orderBy: { startedAt: "desc" },
    });
  }

  async getSyncRun(id: string) {
    const run = await this.tenant.client.syncRun.findUnique({
      where: { id },
      include: { items: true, connection: { select: { provider: true, label: true } } },
    });
    if (!run) {
      throw new NotFoundException("Envío no encontrado");
    }
    return run;
  }
}
