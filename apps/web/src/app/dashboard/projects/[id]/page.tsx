import Link from "next/link";
import { notFound } from "next/navigation";
import type {
  ApiEndpointDto,
  DataModelEntityDto,
  IntakeSessionDto,
  ProjectDto,
  RequirementDto,
  TestCaseDto,
  UserStoryDto,
} from "@devai-factory/shared-types";
import { PLAN_LABEL_ES, planIncludesFullAnalysis } from "@devai-factory/shared-types";
import { apiFetch, safeJson } from "@/lib/api";
import { requireActiveSubscription } from "@/lib/session";
import { StatusBadge } from "@/components/status-badge";
import { IntakeAnswerForm } from "./intake-answer-form";
import { GeneratePanel } from "./generate-panel";
import { RequirementsList } from "./requirements-list";
import { TraceabilityView } from "./traceability-view";
import { DataModelView, ApiEndpointsView } from "./data-model-view";
import { ExportPanel } from "./export-panel";

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h2 className="font-accent text-sm font-semibold text-foreground">{title}</h2>
      <p className="text-xs text-muted">{subtitle}</p>
    </div>
  );
}

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSubscription();
  const canUseFullAnalysis = planIncludesFullAnalysis(session.organization.plan);
  const { id } = await params;

  const [projectRes, intakeRes] = await Promise.all([apiFetch(`/projects/${id}`), apiFetch(`/projects/${id}/intake`)]);
  if (projectRes.status === 404) {
    notFound();
  }
  const project: ProjectDto = await projectRes.json();
  const intake = intakeRes.ok ? await safeJson<IntakeSessionDto>(intakeRes) : null;
  const storiesOnly = project.storiesOnly;

  let requirements: RequirementDto[] = [];
  let stories: UserStoryDto[] = [];
  let testCases: TestCaseDto[] = [];
  let dataModel: DataModelEntityDto[] = [];
  let apiEndpoints: ApiEndpointDto[] = [];

  if (project.status === "generated" || project.status === "failed") {
    const [reqRes, storiesRes, testCasesRes, dataModelRes, apiRes] = await Promise.all([
      apiFetch(`/projects/${id}/requirements`),
      apiFetch(`/projects/${id}/user-stories`),
      apiFetch(`/projects/${id}/test-cases`),
      apiFetch(`/projects/${id}/data-model`),
      apiFetch(`/projects/${id}/api-endpoints`),
    ]);
    if (reqRes.ok) requirements = await reqRes.json();
    if (storiesRes.ok) stories = await storiesRes.json();
    if (testCasesRes.ok) testCases = await testCasesRes.json();
    if (dataModelRes.ok) dataModel = await dataModelRes.json();
    if (apiRes.ok) apiEndpoints = await apiRes.json();
  }

  const lastQuestionsMessage = intake?.messages
    ? [...intake.messages].reverse().find((m) => m.meta && "questions" in m.meta)
    : undefined;
  const questions =
    lastQuestionsMessage?.meta && "questions" in lastQuestionsMessage.meta
      ? lastQuestionsMessage.meta.questions
      : [];

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <Link
          href={storiesOnly ? "/dashboard/quick-stories" : "/dashboard"}
          className="text-sm text-muted hover:underline"
        >
          {storiesOnly ? "← Historia de usuario" : "← Análisis completo"}
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <h1 className="font-heading text-xl font-bold">{project.name}</h1>
          <StatusBadge status={project.status} />
        </div>
        {project.domain && <p className="text-sm capitalize text-muted">Dominio detectado: {project.domain}</p>}
      </div>

      {project.status === "intake" && questions.length > 0 && (
        <section className="space-y-3">
          <SectionHeader
            title="Preguntas de aclaración"
            subtitle="La IA necesita estas respuestas para entender bien tu necesidad antes de generar el análisis."
          />
          {canUseFullAnalysis ? (
            <IntakeAnswerForm projectId={project.id} questions={questions} />
          ) : (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
              Este proyecto de análisis completo quedó pendiente de respuestas, pero tu plan{" "}
              {PLAN_LABEL_ES[session.organization.plan]} ya no lo incluye. Mejora tu plan en{" "}
              <Link href="/dashboard/billing" className="underline">
                Facturación
              </Link>{" "}
              para continuarlo.
            </p>
          )}
        </section>
      )}

      {(project.status === "ready_to_generate" ||
        project.status === "generating" ||
        project.status === "generated" ||
        project.status === "failed") && (
        <section className="space-y-3">
          <SectionHeader
            title={storiesOnly ? "Generación de la historia de usuario" : "Generación del paquete de análisis"}
            subtitle={
              storiesOnly
                ? "Con tu descripción y tus respuestas, la IA genera una historia de usuario detallada con sus criterios de aceptación. Suele tomar 1-2 minutos — puedes cerrar esta pantalla, el progreso se guarda."
                : "Con tu descripción y tus respuestas, la IA genera requerimientos, historias de usuario, modelo de datos, API sugerida y casos de prueba. Suele tomar entre 3 y 8 minutos según el tamaño del proyecto — puedes cerrar esta pantalla, el progreso se guarda."
            }
          />
          {!storiesOnly && !canUseFullAnalysis && project.status !== "generating" ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
              Tu plan {PLAN_LABEL_ES[session.organization.plan]} ya no incluye el análisis completo, así que no
              puedes {project.status === "generated" ? "regenerarlo" : "generarlo"}. Mejora tu plan en{" "}
              <Link href="/dashboard/billing" className="underline">
                Facturación
              </Link>
              .
            </p>
          ) : (
            <GeneratePanel projectId={project.id} status={project.status} storiesOnly={storiesOnly} />
          )}
        </section>
      )}

      {requirements.length > 0 && (
        <>
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            Este paquete es un borrador experto generado por IA. Revísalo antes de usarlo como base contractual,
            de cumplimiento normativo, o en dominios regulados (salud, finanzas, legal).
          </p>

          <section className="space-y-3">
            <SectionHeader
              title="Exportar"
              subtitle={
                storiesOnly
                  ? "Descarga tu historia de usuario detallada para compartirla con tu equipo."
                  : "Descarga todo el paquete (requerimientos, historias, modelo de datos, API y casos de prueba) para compartirlo con tu equipo."
              }
            />
            <ExportPanel projectId={project.id} />
          </section>

          {!storiesOnly && (
            <section className="space-y-3">
              <SectionHeader
                title={`Requerimientos (${requirements.length})`}
                subtitle="Lo que el sistema debe hacer o cumplir, extraído de tu descripción y respuestas."
              />
              <RequirementsList requirements={requirements} />
            </section>
          )}
        </>
      )}

      {stories.length > 0 && (
        <section className="space-y-3">
          <SectionHeader
            title={storiesOnly ? "Historia de usuario" : "Trazabilidad: historias, criterios y casos de prueba"}
            subtitle={
              storiesOnly
                ? 'Tu historia de usuario ("como... quiero... para...") con sus criterios de aceptación en formato Given/When/Then.'
                : 'Cómo cada requerimiento se traduce en una historia de usuario ("como... quiero... para..."), sus criterios de aceptación (cuándo se considera cumplida) y los casos de prueba que la verifican.'
            }
          />
          <TraceabilityView requirements={requirements} stories={stories} testCases={testCases} />
        </section>
      )}

      {dataModel.length > 0 && (
        <section className="space-y-3">
          <SectionHeader
            title="Modelo de datos"
            subtitle="Las entidades (tablas) que el sistema necesitaría, con su diccionario de datos completo y cómo se relacionan entre sí."
          />
          <DataModelView entities={dataModel} />
        </section>
      )}

      {apiEndpoints.length > 0 && (
        <section className="space-y-3">
          <SectionHeader
            title={`API sugerida (${apiEndpoints.length})`}
            subtitle="Los endpoints REST que un equipo de desarrollo necesitaría construir para soportar las historias de usuario de arriba."
          />
          <ApiEndpointsView endpoints={apiEndpoints} />
        </section>
      )}
    </div>
  );
}
