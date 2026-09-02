import { Module } from "@nestjs/common";
import { OrchestratorModule } from "../orchestrator/orchestrator.module";
import { ProjectsController } from "./projects.controller";
import { RequirementsController } from "./requirements.controller";
import { UserStoriesController } from "./user-stories.controller";
import { TestCasesController } from "./test-cases.controller";
import { ProjectsService } from "./projects.service";

@Module({
  imports: [OrchestratorModule],
  controllers: [ProjectsController, RequirementsController, UserStoriesController, TestCasesController],
  providers: [ProjectsService],
})
export class ProjectsModule {}
