import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaClient } from "@prisma/client";
import { bypassRls, forOrg } from "../common/prisma-rls";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(config: ConfigService) {
    // Runtime connection MUST use the restricted `devai_app` role (see
    // migration 20260902032632_app_runtime_role), never the owner role from
    // DATABASE_URL — the owner is a Postgres superuser in local Docker
    // setups and superusers always bypass Row-Level Security, silently
    // making every RLS policy a no-op. DATABASE_URL stays reserved for
    // `prisma migrate` (needs owner privileges to alter schema).
    super({ datasourceUrl: config.getOrThrow<string>("DATABASE_APP_URL") });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /** Client scoped to a single organization; every query is RLS-checked against it. */
  forOrg(orgId: string) {
    return this.$extends(forOrg(orgId));
  }

  /** Client that bypasses RLS. Only for AuthService (register/login) and the platform-admin module — both legitimately need cross-tenant access. */
  bypassRls() {
    return this.$extends(bypassRls());
  }
}
