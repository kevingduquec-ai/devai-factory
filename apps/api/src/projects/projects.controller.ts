import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { ProjectsService } from "./projects.service";
import { CreateProjectDto } from "./dto/create-project.dto";
import { CreateQuickStoryDto } from "./dto/create-quick-story.dto";
import { AnswerIntakeDto } from "./dto/answer-intake.dto";

@UseGuards(JwtAuthGuard)
@Controller("projects")
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  create(@Body() dto: CreateProjectDto) {
    return this.projectsService.create(dto);
  }

  @Post("quick-story")
  createQuickStory(@Body() dto: CreateQuickStoryDto) {
    return this.projectsService.createQuickStory(dto);
  }

  @Get()
  findAll(@Query("storiesOnly") storiesOnly?: string) {
    return this.projectsService.findAll(storiesOnly === undefined ? undefined : storiesOnly === "true");
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.projectsService.findOne(id);
  }

  @Get(":id/intake")
  getIntake(@Param("id") id: string) {
    return this.projectsService.getIntake(id);
  }

  @Post(":id/intake/message")
  answerIntake(@Param("id") id: string, @Body() dto: AnswerIntakeDto) {
    return this.projectsService.answerIntake(id, dto);
  }

  @Post(":id/generate")
  generate(@Param("id") id: string) {
    return this.projectsService.triggerGenerate(id);
  }

  @Get(":id/generate/status")
  generateStatus(@Param("id") id: string) {
    return this.projectsService.getGenerateStatus(id);
  }

  @Get(":id/requirements")
  listRequirements(@Param("id") id: string) {
    return this.projectsService.listRequirements(id);
  }

  @Get(":id/user-stories")
  listUserStories(@Param("id") id: string) {
    return this.projectsService.listUserStories(id);
  }

  @Get(":id/data-model")
  listDataModel(@Param("id") id: string) {
    return this.projectsService.listDataModel(id);
  }

  @Get(":id/api-endpoints")
  listApiEndpoints(@Param("id") id: string) {
    return this.projectsService.listApiEndpoints(id);
  }

  @Get(":id/test-cases")
  listTestCases(@Param("id") id: string) {
    return this.projectsService.listTestCases(id);
  }
}
