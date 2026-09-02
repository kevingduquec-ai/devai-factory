import type { AcceptanceCriterion, Requirement, TestCase, UserStory } from "@prisma/client";
import type { CanonicalPayload } from "./providers/provider.types";

type StoryWithCriteria = UserStory & { acceptanceCriteria: AcceptanceCriterion[] };
type TestCaseWithCriterion = TestCase & { acceptanceCriterion: AcceptanceCriterion & { userStoryId: string } };

/**
 * Capa 1 del módulo: traduce lo que ya existe en la base de datos
 * (Requirement/UserStory/TestCase, generados por el orquestador de IA) al
 * modelo canónico neutral que consume el motor de sincronización. No hay
 * tabla ni paso extra de "serialización" — la estructura ya es la misma
 * para el modo "análisis completo" y para "historia de usuario" (un solo
 * Requirement + una sola UserStory); esta función solo cambia la forma, no
 * el contenido.
 */
export function buildCanonicalPayload(
  requirements: Requirement[],
  stories: StoryWithCriteria[],
  testCases: TestCaseWithCriterion[],
): CanonicalPayload {
  return {
    epics: requirements.map((r) => ({
      internalId: r.id,
      code: r.code,
      title: r.title,
      description: r.description,
      businessRules: r.businessRules,
      dependencies: r.dependencies,
      acceptanceCriteria: Array.isArray(r.acceptanceCriteria)
        ? (r.acceptanceCriteria as unknown as { given: string; when: string; then: string }[])
        : [],
    })),
    stories: stories.map((s) => ({
      internalId: s.id,
      code: s.code,
      epicInternalId: s.requirementId,
      title: s.title,
      narrative: `Como ${s.actor}, quiero ${s.goal}, para ${s.benefit}.`,
      priority: s.priority ?? null,
      storyPoints: s.storyPoints ?? null,
      acceptanceCriteria: s.acceptanceCriteria.map((ac) => ({
        scenarioName: ac.scenarioName,
        given: ac.given,
        when: ac.when,
        then: ac.then,
      })),
      definitionOfReady: s.definitionOfReady,
      definitionOfDone: s.definitionOfDone,
      dependencies: s.dependencies,
    })),
    testCases: testCases.map((tc) => ({
      internalId: tc.id,
      code: tc.code,
      storyInternalId: tc.acceptanceCriterion.userStoryId,
      title: tc.title,
      type: tc.type,
      severity: tc.severity,
      precondition: tc.precondition,
      steps: Array.isArray(tc.steps) ? (tc.steps as unknown as string[]) : [],
      testData: tc.testData,
      expectedResult: tc.expectedResult,
    })),
  };
}
