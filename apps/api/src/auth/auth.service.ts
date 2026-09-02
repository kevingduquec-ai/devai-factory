import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { OrgRole, UserStatus } from "@prisma/client";
import * as argon2 from "argon2";
import { PrismaService } from "../prisma/prisma.service";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { AcceptInviteDto } from "./dto/accept-invite.dto";

interface AccessPayload {
  sub: string;
  orgId: string;
  role: OrgRole;
  email: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  private async issueTokens(payload: AccessPayload) {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, {
        secret: this.config.getOrThrow<string>("JWT_ACCESS_SECRET"),
        expiresIn: this.config.get<string>("JWT_ACCESS_TTL", "15m"),
      }),
      this.jwt.signAsync(payload, {
        secret: this.config.getOrThrow<string>("JWT_REFRESH_SECRET"),
        expiresIn: this.config.get<string>("JWT_REFRESH_TTL", "7d"),
      }),
    ]);
    return { accessToken, refreshToken };
  }

  async register(dto: RegisterDto) {
    const db = this.prisma.bypassRls();

    const existing = await db.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException("Ya existe una cuenta con este correo");
    }

    const passwordHash = await argon2.hash(dto.password);

    const { organization, user } = await db.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: { name: dto.organizationName, plan: "starter" },
      });
      const user = await tx.user.create({
        data: {
          orgId: organization.id,
          email: dto.email,
          name: dto.name,
          role: OrgRole.owner,
          status: UserStatus.active,
          passwordHash,
        },
      });
      return { organization, user };
    });

    const tokens = await this.issueTokens({
      sub: user.id,
      orgId: organization.id,
      role: user.role,
      email: user.email,
    });
    return { ...tokens, user: this.toPublicUser(user), organization };
  }

  async login(dto: LoginDto) {
    const db = this.prisma.bypassRls();
    const user = await db.user.findUnique({ where: { email: dto.email } });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException("Credenciales inválidas");
    }
    let valid: boolean;
    try {
      valid = await argon2.verify(user.passwordHash, dto.password);
    } catch {
      // Un hash con formato inválido no debe filtrarse como error 500 — se
      // trata igual que una contraseña incorrecta.
      valid = false;
    }
    if (!valid) {
      throw new UnauthorizedException("Credenciales inválidas");
    }
    if (user.status !== UserStatus.active) {
      throw new UnauthorizedException("La cuenta aún no ha sido activada");
    }
    await this.assertOrgNotSuspended(user.orgId);

    const tokens = await this.issueTokens({
      sub: user.id,
      orgId: user.orgId,
      role: user.role,
      email: user.email,
    });
    return { ...tokens, user: this.toPublicUser(user) };
  }

  async refresh(refreshToken: string) {
    let payload: AccessPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessPayload>(refreshToken, {
        secret: this.config.getOrThrow<string>("JWT_REFRESH_SECRET"),
      });
    } catch {
      throw new UnauthorizedException("Refresh token inválido o expirado");
    }

    const db = this.prisma.bypassRls();
    const user = await db.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.status !== UserStatus.active) {
      throw new UnauthorizedException("Usuario no válido");
    }
    await this.assertOrgNotSuspended(user.orgId);

    return this.issueTokens({ sub: user.id, orgId: user.orgId, role: user.role, email: user.email });
  }

  /**
   * También se verifica en JwtStrategy.validate en cada request autenticado
   * — aquí se repite solo para dar un mensaje claro en el momento exacto de
   * iniciar sesión o refrescar, en vez de esperar a la primera llamada
   * posterior a la API.
   */
  private async assertOrgNotSuspended(orgId: string) {
    const org = await this.prisma.bypassRls().organization.findUnique({ where: { id: orgId }, select: { suspended: true } });
    if (!org || org.suspended) {
      throw new ForbiddenException("Tu organización fue suspendida. Contacta al equipo de Qubit para más información.");
    }
  }

  async acceptInvite(dto: AcceptInviteDto) {
    let payload: { sub: string; purpose: string };
    try {
      payload = await this.jwt.verifyAsync(dto.token, {
        secret: this.config.getOrThrow<string>("JWT_ACCESS_SECRET"),
      });
    } catch {
      throw new BadRequestException("Invitación inválida o expirada");
    }
    if (payload.purpose !== "invite") {
      throw new BadRequestException("Token no es una invitación válida");
    }

    const db = this.prisma.bypassRls();
    const user = await db.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.status !== UserStatus.invited) {
      throw new BadRequestException("Esta invitación ya fue utilizada o no existe");
    }

    const passwordHash = await argon2.hash(dto.password);
    const updated = await db.user.update({
      where: { id: user.id },
      data: { passwordHash, status: UserStatus.active },
    });

    const tokens = await this.issueTokens({
      sub: updated.id,
      orgId: updated.orgId,
      role: updated.role,
      email: updated.email,
    });
    return { ...tokens, user: this.toPublicUser(updated) };
  }

  private toPublicUser(user: {
    id: string;
    orgId: string;
    email: string;
    name: string;
    role: OrgRole;
    status: UserStatus;
  }) {
    return {
      id: user.id,
      orgId: user.orgId,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
    };
  }
}
