import { ForbiddenException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { PrismaService } from "../../prisma/prisma.service";

export interface JwtAccessPayload {
  sub: string;
  orgId: string;
  role: string;
  email: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, "jwt") {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>("JWT_ACCESS_SECRET"),
    });
  }

  // Se ejecuta en CADA request autenticado (no solo en login) — así una
  // organización suspendida pierde el acceso de inmediato aunque el
  // usuario ya tenga un access token válido sin expirar, cerrando el hueco
  // que dejaría verificar la suspensión solo al iniciar sesión.
  async validate(payload: JwtAccessPayload) {
    const org = await this.prisma
      .bypassRls()
      .organization.findUnique({ where: { id: payload.orgId }, select: { suspended: true } });
    if (!org || org.suspended) {
      throw new ForbiddenException("Tu organización fue suspendida. Contacta al equipo de Qubit para más información.");
    }
    return { userId: payload.sub, orgId: payload.orgId, role: payload.role, email: payload.email };
  }
}
