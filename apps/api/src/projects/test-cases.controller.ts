import { Body, Controller, Param, Patch, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { ProjectsService } from "./projects.service";
import { UpdateTestCaseDto } from "./dto/update-test-case.dto";

@UseGuards(JwtAuthGuard)
@Controller("test-cases")
export class TestCasesController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateTestCaseDto) {
    return this.projectsService.updateTestCase(id, dto);
  }
}
