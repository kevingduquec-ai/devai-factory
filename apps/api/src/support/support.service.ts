import { Injectable } from "@nestjs/common";
import { TenantPrismaService } from "../prisma/tenant-prisma.service";
import { SendSupportMessageDto } from "./dto/send-support-message.dto";

@Injectable()
export class SupportService {
  constructor(private readonly tenant: TenantPrismaService) {}

  /**
   * Trae el hilo completo y de paso marca como leídos los mensajes del
   * admin — cualquier persona de la organización que abra el chat "lee
   * por" toda la organización, ya que el hilo es compartido por equipo,
   * no por persona.
   */
  async listMessages() {
    const { orgId } = this.tenant.currentUser;
    const db = this.tenant.client;
    const [messages, conversation] = await Promise.all([
      db.supportMessage.findMany({
        where: { orgId },
        orderBy: { createdAt: "asc" },
        include: { senderUser: { select: { name: true } } },
      }),
      db.supportConversation.findUnique({ where: { orgId } }),
    ]);
    await db.supportMessage.updateMany({
      where: { orgId, senderIsAdmin: true, readByOrg: false },
      data: { readByOrg: true },
    });
    return { closed: conversation?.closed ?? false, messages };
  }

  /**
   * Solo el super-admin puede cerrar una conversación (ver
   * AdminSupportService.setClosed) — pero si la organización vuelve a
   * escribir en una que estaba cerrada, se reabre sola aquí. No es una
   * acción de "reabrir" que la organización pueda elegir, es un efecto
   * secundario de seguir hablando.
   */
  async sendMessage(dto: SendSupportMessageDto) {
    const { orgId, userId } = this.tenant.currentUser;
    const db = this.tenant.client;
    const [message] = await Promise.all([
      db.supportMessage.create({
        data: { orgId, senderUserId: userId, senderIsAdmin: false, body: dto.body },
        include: { senderUser: { select: { name: true } } },
      }),
      db.supportConversation.upsert({
        where: { orgId },
        create: { orgId, closed: false },
        update: { closed: false, closedAt: null },
      }),
    ]);
    return message;
  }

  /** Solo cuenta — no marca como leído, para que la burbuja pueda mostrar el número sin que el usuario haya abierto el chat todavía. */
  async unreadCount() {
    const { orgId } = this.tenant.currentUser;
    const db = this.tenant.client;
    const count = await db.supportMessage.count({
      where: { orgId, senderIsAdmin: true, readByOrg: false },
    });
    return { count };
  }
}
