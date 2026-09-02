-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "subscription_active" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: las organizaciones que ya existían antes de esta migración
-- venían del modelo anterior (acceso inmediato al registrarse) — se
-- consideran ya activas para no bloquear cuentas existentes. Solo los
-- registros NUEVOS a partir de aquí arrancan con subscription_active=false.
UPDATE "organizations" SET "subscription_active" = true;
