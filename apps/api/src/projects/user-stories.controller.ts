import { Body, Controller, Param, Patch, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { ProjectsService } from "./projects.service";
import { UpdateUserStoryDto } from "./dto/update-user-story.dto";

@UseGuards(JwtAuthGuard)
@Controller("user-stories")
export class UserStoriesController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateUserStoryDto) {
    return this.projectsService.updateUserStory(id, dto);
  }
}
