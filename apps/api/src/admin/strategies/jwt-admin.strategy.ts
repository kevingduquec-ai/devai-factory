import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";

export interface JwtAdminPayload {
  sub: string;
  email: string;
  purpose: "platform_admin";
}

@Injectable()
export class JwtAdminStrategy extends PassportStrategy(Strategy, "jwt-admin") {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>("JWT_ADMIN_SECRET"),
    });
  }

  validate(payload: JwtAdminPayload) {
    if (payload.purpose !== "platform_admin") {
      return false;
    }
    return { adminId: payload.sub, email: payload.email };
  }
}
