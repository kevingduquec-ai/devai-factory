import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SendAdminSupportMessageDto } from "./dto/send-admin-support-message.dto";
import { UpdateSupportConversationDto } from "./dto/update-support-conversation.dto";

@Injectable()
export class AdminSupportService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Una fila por organización que ya tiene al menos un mensaje — el chat es
   * un buzón de conversaciones que alguien inició, no un directorio de
   * todas las organizaciones. Ordenadas por el mensaje más reciente, para
   * que las conversaciones activas queden arriba.
   */
  async listConversations() {
    const db = this.prisma.bypassRls();
    const orgs = await db.organization.findMany({
      where: { supportMessages: { some: {} } },
      select: {
        id: true,
        name: true,
        plan: true,
        supportConversation: { select: { closed: true } },
        supportMessages: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        _count: {
          select: {
            supportMessages: { where: { senderIsAdmin: false, readByAdmin: false } },
          },
        },
      },
    });
    return orgs
      .map((org) => ({
        orgId: org.id,
        orgName: org.name,
        plan: org.plan,
        closed: org.supportConversation?.closed ?? false,
        lastMessage: org.supportMessages[0] ?? null,
        unreadCount: org._count.supportMessages,
      }))
      .sort((a, b) => {
        const at = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
        const bt = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0;
        return bt - at;
      });
  }

  async getMessages(orgId: string) {
    const db = this.prisma.bypassRls();
    const org = await db.organization.findUnique({
      where: { id: orgId },
      select: { id: true, name: true, plan: true },
    });
    if (!org) {
      throw new NotFoundException("Organización no encontrada");
    }
    const [messages, conversation] = await Promise.all([
      db.supportMessage.findMany({
        where: { orgId },
        orderBy: { createdAt: "asc" },
        include: { senderUser: { select: { name: true, email: true } } },
      }),
      db.supportConversation.findUnique({ where: { orgId } }),
    ]);
    await db.supportMessage.updateMany({
      where: { orgId, senderIsAdmin: false, readByAdmin: false },
      data: { readByAdmin: true },
    });
    return { organization: org, closed: conversation?.closed ?? false, messages };
  }

  /**
   * Si el admin responde después de haber cerrado la conversación, se
   * reabre — cerrar es una decisión explícita (el botón), no algo que deba
   * seguir marcado mientras el admin sigue escribiendo ahí mismo.
   */
  async sendMessage(orgId: string, dto: SendAdminSupportMessageDto) {
    const db = this.prisma.bypassRls();
    const org = await db.organization.findUnique({ where: { id: orgId } });
    if (!org) {
      throw new NotFoundException("Organización no encontrada");
    }
    const [message] = await Promise.all([
      db.supportMessage.create({
        data: { orgId, senderIsAdmin: true, body: dto.body },
      }),
      db.supportConversation.upsert({
        where: { orgId },
        create: { orgId, closed: false },
        update: { closed: false, closedAt: null },
      }),
    ]);
    return message;
  }

  /**
   * Cerrar o reabrir es siempre una acción explícita del super-admin — la
   * organización nunca puede cerrar su propia conversación, solo reabrirla
   * implícitamente al volver a escribir (ver SupportService.sendMessage).
   */
  async setClosed(orgId: string, dto: UpdateSupportConversationDto) {
    const db = this.prisma.bypassRls();
    const org = await db.organization.findUnique({ where: { id: orgId } });
    if (!org) {
      throw new NotFoundException("Organización no encontrada");
    }
    return db.supportConversation.upsert({
      where: { orgId },
      create: { orgId, closed: dto.closed, closedAt: dto.closed ? new Date() : null },
      update: { closed: dto.closed, closedAt: dto.closed ? new Date() : null },
    });
  }

  /** Total de mensajes sin leer en TODAS las conversaciones, para un badge global en el panel de admin. */
  async totalUnreadCount() {
    const db = this.prisma.bypassRls();
    const count = await db.supportMessage.count({
      where: { senderIsAdmin: false, readByAdmin: false },
    });
    return { count };
  }
}
