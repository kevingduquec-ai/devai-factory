import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { PrismaService } from "../prisma/prisma.service";
import { AdminLoginDto } from "./dto/admin-login.dto";

@Injectable()
export class AdminAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(dto: AdminLoginDto) {
    const admin = await this.prisma.platformAdmin.findUnique({ where: { email: dto.email } });
    if (!admin) {
      throw new UnauthorizedException("Credenciales inválidas");
    }
    let valid: boolean;
    try {
      valid = await argon2.verify(admin.passwordHash, dto.password);
    } catch {
      valid = false;
    }
    if (!valid) {
      throw new UnauthorizedException("Credenciales inválidas");
    }

    const accessToken = await this.jwt.signAsync(
      { sub: admin.id, email: admin.email, purpose: "platform_admin" },
      {
        secret: this.config.getOrThrow<string>("JWT_ADMIN_SECRET"),
        expiresIn: this.config.get<string>("JWT_ADMIN_TTL", "8h"),
      },
    );

    return { accessToken, admin: { id: admin.id, email: admin.email, name: admin.name } };
  }
}
