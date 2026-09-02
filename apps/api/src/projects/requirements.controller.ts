import { Body, Controller, Param, Patch, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { ProjectsService } from "./projects.service";
import { UpdateRequirementDto } from "./dto/update-requirement.dto";

@UseGuards(JwtAuthGuard)
@Controller("requirements")
export class RequirementsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateRequirementDto) {
    return this.projectsService.updateRequirement(id, dto);
  }
}
