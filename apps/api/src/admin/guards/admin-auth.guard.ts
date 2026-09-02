import { Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

/** Exige un token firmado con JWT_ADMIN_SECRET — un token de sesión de organización nunca pasa aquí. */
@Injectable()
export class AdminAuthGuard extends AuthGuard("jwt-admin") {}
