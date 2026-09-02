import { Body, Controller, Get, Patch, Post, UseGuards } from "@nestjs/common";
import { OrgRole } from "@prisma/client";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { OrganizationsService } from "./organizations.service";
import { UpdateOrganizationDto } from "./dto/update-organization.dto";
import { InviteUserDto } from "./dto/invite-user.dto";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("orgs")
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get("me")
  getMine() {
    return this.organizationsService.getMine();
  }

  @Roles(OrgRole.owner, OrgRole.admin)
  @Patch("me")
  updateMine(@Body() dto: UpdateOrganizationDto) {
    return this.organizationsService.updateMine(dto);
  }

  @Get("users")
  listUsers() {
    return this.organizationsService.listUsers();
  }

  @Get("usage")
  getUsage() {
    return this.organizationsService.getUsage();
  }

  @Roles(OrgRole.owner)
  @Post("invite")
  inviteUser(@Body() dto: InviteUserDto) {
    return this.organizationsService.inviteUser(dto);
  }
}
