import { Injectable, NotFoundException } from "@nestjs/common";
import { OrgRole, SubscriptionPlan } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateOrganizationAdminDto } from "./dto/update-organization-admin.dto";

@Injectable()
export class AdminOrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async listAll() {
    const db = this.prisma.bypassRls();
    const orgs = await db.organization.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        users: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            singleStoryEnabled: true,
            integrationsEnabled: true,
            qaAutomationEnabled: true,
          },
          orderBy: { createdAt: "asc" },
        },
        _count: { select: { users: true, projects: true } },
      },
    });
    return orgs.map((org) => {
      const owner = org.users.find((u) => u.role === OrgRole.owner);
      return {
        id: org.id,
        name: org.name,
        plan: org.plan,
        suspended: org.suspended,
        subscriptionActive: org.subscriptionActive,
        billingCustomerId: org.billingCustomerId,
        ownerEmail: owner?.email ?? null,
        ownerName: owner?.name ?? null,
        userCount: org._count.users,
        projectCount: org._count.projects,
        users: org.users,
        createdAt: org.createdAt,
      };
    });
  }

  async update(orgId: string, dto: UpdateOrganizationAdminDto) {
    const db = this.prisma.bypassRls();
    const existing = await db.organization.findUnique({ where: { id: orgId } });
    if (!existing) {
      throw new NotFoundException("Organización no encontrada");
    }
    return db.organization.update({
      where: { id: orgId },
      data: {
        ...(dto.plan !== undefined ? { plan: dto.plan as SubscriptionPlan } : {}),
        ...(dto.suspended !== undefined ? { suspended: dto.suspended } : {}),
        ...(dto.subscriptionActive !== undefined ? { subscriptionActive: dto.subscriptionActive } : {}),
      },
    });
  }
}
