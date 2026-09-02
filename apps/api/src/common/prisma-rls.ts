import { Prisma } from "@prisma/client";

/**
 * Scopes every query on this extended client to a single organization by
 * setting a transaction-local Postgres session variable before each
 * operation. The variable is read by the RLS policies created in the
 * `rls_policies` migration, so tenant isolation is enforced at the database
 * layer even if a service forgets to add `where: { orgId }`.
 */
export function forOrg(orgId: string) {
  return Prisma.defineExtension((prisma) =>
    prisma.$extends({
      name: "forOrg",
      query: {
        $allModels: {
          async $allOperations({ args, query }) {
            const [, result] = await prisma.$transaction([
              prisma.$executeRaw`SELECT set_config('app.current_org_id', ${orgId}, TRUE)`,
              query(args),
            ]);
            return result;
          },
        },
      },
    }),
  );
}

/**
 * Bypasses org-scoped RLS policies for operations that legitimately need to
 * read/write across organizations: registration (org doesn't exist yet) and
 * login (the user's org is unknown until we find them by email).
 * Only ever used from AuthService — never expose this to request handlers
 * that return data to a client.
 */
export function bypassRls() {
  return Prisma.defineExtension((prisma) =>
    prisma.$extends({
      name: "bypassRls",
      query: {
        $allModels: {
          async $allOperations({ args, query }) {
            const [, result] = await prisma.$transaction([
              prisma.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`,
              query(args),
            ]);
            return result;
          },
        },
      },
    }),
  );
}
