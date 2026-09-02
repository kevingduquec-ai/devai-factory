# DevAI Factory

Plataforma que convierte una necesidad de software descrita en lenguaje natural en
un paquete de análisis: requerimientos, historias de usuario, criterios de aceptación,
modelo de datos, propuesta de API y casos de prueba — potenciada por la API de Claude.

Ver `especificacion-tecnica.md` (o el documento original) para la arquitectura completa
y el backlog. Este repo implementa el MVP por etapas siguiendo ese plan de sprints.

## Estado actual

**Etapa 1 (semanas 1–2 del plan de sprints): base del proyecto.**

- Monorepo pnpm: `apps/web` (Next.js), `apps/api` (NestJS), `packages/shared-types`.
- Autenticación con JWT (access + refresh) y contraseñas con argon2.
- Multi-tenancy: cada fila de negocio tiene `org_id`; aplicado en dos capas:
  - A nivel de aplicación (`TenantPrismaService` siempre filtra por la organización del usuario autenticado).
  - A nivel de base de datos con Row-Level Security de PostgreSQL (ver `apps/api/prisma/migrations`).
- Roles `owner / admin / member` con guard de autorización.
- Invitación de usuarios a la organización (token firmado, sin envío de correo todavía).
- Frontend: registro, login, dashboard con lista de equipo. Sesión en cookies httpOnly.

**Etapa 2 (semanas 3–4 del plan de sprints): intake + primera etapa del orquestador.**

- Orquestador de IA (`apps/api/src/orchestrator`): cliente de Claude con salida
  estructurada vía Zod (`output_config.format`, nunca texto libre a parsear),
  3 etapas: intake conversacional → preguntas de aclaración → extracción de
  requerimientos. Plantillas de dominio (`packages/domain-templates`) inyectan
  guías específicas (salud, finanzas, retail, logística) en el prompt.
- Un proyecto pasa de texto libre → resumen estructurado + preguntas
  (síncrono) → respuestas del cliente → generación de requerimientos
  (asíncrona, job de BullMQ con progreso consultable).
- Frontend: crear proyecto, responder preguntas de aclaración, ver progreso
  de generación, ver/editar requerimientos generados.

**Etapa 3 (semanas 5–6 del plan de sprints): resto del pipeline, con trazabilidad.**

- El orquestador ahora corre las 7 etapas completas en un solo job de
  `/projects/:id/generate`: requerimientos → historias de usuario +
  criterios de aceptación (enlazadas a su REQ) → modelo de datos + API
  (consistentes entre sí) → casos de prueba (funcional/negativo/seguridad/
  integración, enlazados a su criterio) → validación de trazabilidad
  (no bloqueante, registra en log si algo quedó sin enlazar).
- Reintento automático con instrucción de corrección si una etapa devuelve
  JSON inválido o incompleto (incluye el caso de respuesta truncada por
  `max_tokens`, que el SDK reporta como excepción, no como salida nula).
- Frontend: vista de trazabilidad (requerimiento → historia → criterio →
  casos de prueba), vista del modelo de datos y de la API sugerida, barra
  de progreso con etiqueta por etapa, y el aviso de "borrador experto"
  que exige la sección 10 de la especificación.

**Etapa 4 (semana 7 del plan de sprints): edición de artefactos + exportación.**

- Todo el texto de la interfaz está en español, con explicaciones cortas bajo
  cada sección (qué es y para qué sirve) y traducciones consistentes
  (prioridad MoSCoW, tipo de requerimiento, tipo de campo del modelo de
  datos, método HTTP) compartidas entre frontend y backend vía
  `packages/shared-types`.
- Edición manual desde la UI: requerimientos (título, descripción,
  prioridad), historias de usuario (actor/quiero/para) y casos de prueba
  (tipo, resultado esperado) — cada guardado muestra un indicador de
  "guardando" mientras espera la respuesta del servidor.
- Exportación a PDF y Word (`apps/api/src/export`): un botón por formato,
  con indicador de "generando..." mientras se arma el documento. El PDF usa
  una fuente Unicode incrustada (DejaVu Sans) en vez de las fuentes base de
  PDF, para que tildes y "ñ" se vean bien en cualquier lector. Los archivos
  se guardan en `apps/api/storage/exports/` (no versionado) y quedan
  registrados en `documents_exported` para poder volver a descargarlos.

Lo que **no** está construido todavía (ver especificación técnica):
facturación con Stripe, límites de uso por plan, shadcn/ui, envío de
invitaciones por correo.

## Requisitos

- Node.js 20+
- pnpm (`npm install -g pnpm` si no lo tienes)
- Docker (para Postgres y Redis en desarrollo)

## Arrancar en desarrollo

```bash
cp .env.example apps/api/.env
docker compose up -d
pnpm install
pnpm --filter @devai-factory/api prisma:migrate
pnpm dev:api    # http://localhost:4000/api
pnpm dev:web    # http://localhost:3000
```

> **Importante:** `DATABASE_URL` (rol dueño de las tablas) es solo para `prisma
> migrate`. La API se conecta con `DATABASE_APP_URL` (rol `devai_app`,
> creado por la migración `app_runtime_role`), porque el rol dueño es
> superusuario en el Postgres de Docker por defecto, y un superusuario
> **siempre** se salta Row-Level Security sin importar las políticas — así
> se descubrió y se corrigió durante el desarrollo de la etapa 2. Si migras
> a un Postgres gestionado (RDS, Supabase, etc.), verifica que el rol de
> `DATABASE_APP_URL` no tenga el atributo BYPASSRLS ni privilegios de
> superusuario/rds_superuser.

## Estructura

```
devai-factory/
├── apps/
│   ├── web/     # Next.js — frontend
│   └── api/     # NestJS — backend, Prisma, RLS, orquestador (próxima etapa)
├── packages/
│   └── shared-types/   # Tipos TypeScript compartidos
└── docker-compose.yml  # Postgres + Redis para desarrollo local
```
