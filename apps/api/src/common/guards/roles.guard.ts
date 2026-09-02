import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { OrgRole } from "@prisma/client";
import { ROLES_KEY } from "../decorators/roles.decorator";
import type { AuthenticatedRequest } from "../../prisma/tenant-prisma.service";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<OrgRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const role = request.user?.role as OrgRole | undefined;
    if (!role || !requiredRoles.includes(role)) {
      throw new ForbiddenException("No tienes permisos para esta acción");
    }
    return true;
  }
}
