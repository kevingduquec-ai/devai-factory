import type {
  ApiEndpoint,
  DataModelEntity,
  Project,
  Requirement,
  TestCase,
  UserStory,
  AcceptanceCriterion,
} from "@prisma/client";

export interface ExportUserStory extends UserStory {
  acceptanceCriteria: AcceptanceCriterion[];
  requirement: { code: string };
}

export interface ExportTestCase extends TestCase {
  acceptanceCriterion: { given: string; when: string; then: string };
}

export interface ExportBundle {
  project: Project;
  requirements: Requirement[];
  stories: ExportUserStory[];
  dataModel: DataModelEntity[];
  apiEndpoints: ApiEndpoint[];
  testCases: ExportTestCase[];
}
