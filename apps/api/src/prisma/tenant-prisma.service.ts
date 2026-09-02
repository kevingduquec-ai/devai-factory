import { Inject, Injectable, Scope, UnauthorizedException } from "@nestjs/common";
import { REQUEST } from "@nestjs/core";
import type { Request } from "express";
import { PrismaService } from "./prisma.service";

export interface AuthenticatedRequest extends Request {
  user?: { userId: string; orgId: string; role: string; email: string };
}

/**
 * Request-scoped Prisma client pre-bound to the authenticated user's
 * organization. Inject this (not PrismaService) in any controller/service
 * that handles per-tenant data — it can only ever see that org's rows.
 */
@Injectable({ scope: Scope.REQUEST })
export class TenantPrismaService {
  private _client?: ReturnType<PrismaService["forOrg"]>;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REQUEST) private readonly request: AuthenticatedRequest,
  ) {}

  get client() {
    if (!this._client) {
      const orgId = this.request.user?.orgId;
      if (!orgId) {
        throw new UnauthorizedException("No hay contexto de organización autenticado");
      }
      this._client = this.prisma.forOrg(orgId);
    }
    return this._client;
  }

  get currentUser() {
    if (!this.request.user) {
      throw new UnauthorizedException("No hay usuario autenticado");
    }
    return this.request.user;
  }
}
