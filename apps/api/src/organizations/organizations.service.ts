import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { OrgRole, UserStatus } from "@prisma/client";
import { PLAN_LABEL_ES, PLAN_LIMITS, type SubscriptionPlan, type UsageStatusDto } from "@devai-factory/shared-types";
import { TenantPrismaService } from "../prisma/tenant-prisma.service";
import { EmailService } from "../email/email.service";
import { UpdateOrganizationDto } from "./dto/update-organization.dto";
import { InviteUserDto } from "./dto/invite-user.dto";

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly email: EmailService,
  ) {}

  async getMine() {
    const org = await this.tenant.client.organization.findUnique({
      where: { id: this.tenant.currentUser.orgId },
    });
    if (!org) {
      throw new NotFoundException("Organización no encontrada");
    }
    return org;
  }

  async updateMine(dto: UpdateOrganizationDto) {
    return this.tenant.client.organization.update({
      where: { id: this.tenant.currentUser.orgId },
      data: { name: dto.name },
    });
  }

  async listUsers() {
    return this.tenant.client.user.findMany({
      where: { orgId: this.tenant.currentUser.orgId },
      select: { id: true, email: true, name: true, role: true, status: true, singleStoryEnabled: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
  }

  async inviteUser(dto: InviteUserDto) {
    const orgId = this.tenant.currentUser.orgId;
    const existing = await this.tenant.client.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException("Ya existe un usuario con este correo");
    }

    const org = await this.tenant.client.organization.findUniqueOrThrow({ where: { id: orgId }, select: { name: true, plan: true } });
    const limits = PLAN_LIMITS[org.plan as SubscriptionPlan];
    if (limits.maxUsers != null) {
      const userCount = await this.tenant.client.user.count({ where: { orgId } });
      if (userCount >= limits.maxUsers) {
        throw new ForbiddenException(
          `Alcanzaste el límite de ${limits.maxUsers} usuario(s) de tu plan ${PLAN_LABEL_ES[org.plan as SubscriptionPlan]}. Mejora tu plan para invitar más personas.`,
        );
      }
    }

    const user = await this.tenant.client.user.create({
      data: {
        orgId,
        email: dto.email,
        name: dto.email,
        role: dto.role ?? OrgRole.member,
        status: UserStatus.invited,
      },
    });

    const inviteToken = await this.jwt.signAsync(
      { sub: user.id, purpose: "invite" },
      { secret: this.config.getOrThrow<string>("JWT_ACCESS_SECRET"), expiresIn: "3d" },
    );

    const appUrl = this.config.get<string>("APP_URL", "http://localhost:3000");
    const inviteUrl = `${appUrl}/accept-invite?token=${inviteToken}`;
    const emailSent = await this.email.sendInviteEmail({ to: user.email, orgName: org.name, inviteUrl });

    // Si no hay proveedor de correo configurado (desarrollo local), se devuelve el
    // link para que quien invita pueda copiarlo y probarlo manualmente.
    return { user, inviteUrl: emailSent ? undefined : inviteUrl };
  }

  async getUsage(): Promise<UsageStatusDto> {
    const orgId = this.tenant.currentUser.orgId;
    const org = await this.tenant.client.organization.findUniqueOrThrow({ where: { id: orgId }, select: { plan: true } });
    const limits = PLAN_LIMITS[org.plan as SubscriptionPlan];

    const periodStart = new Date();
    periodStart.setDate(1);
    periodStart.setHours(0, 0, 0, 0);

    const [projectsThisMonth, generationsThisMonth, users] = await Promise.all([
      this.tenant.client.project.count({ where: { orgId, createdAt: { gte: periodStart } } }),
      this.tenant.client.generationRun.count({ where: { orgId, createdAt: { gte: periodStart } } }),
      this.tenant.client.user.count({ where: { orgId } }),
    ]);

    return {
      plan: org.plan as SubscriptionPlan,
      projectsThisMonth,
      maxProjectsPerMonth: limits.maxProjectsPerMonth,
      generationsThisMonth,
      maxGenerationsPerMonth: limits.maxGenerationsPerMonth,
      users,
      maxUsers: limits.maxUsers,
      periodStart: periodStart.toISOString(),
    };
  }
}
