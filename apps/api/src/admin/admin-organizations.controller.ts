import { Body, Controller, Get, Param, Patch, UseGuards } from "@nestjs/common";
import { AdminAuthGuard } from "./guards/admin-auth.guard";
import { AdminOrganizationsService } from "./admin-organizations.service";
import { UpdateOrganizationAdminDto } from "./dto/update-organization-admin.dto";

@UseGuards(AdminAuthGuard)
@Controller("admin/organizations")
export class AdminOrganizationsController {
  constructor(private readonly adminOrganizationsService: AdminOrganizationsService) {}

  @Get()
  listAll() {
    return this.adminOrganizationsService.listAll();
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateOrganizationAdminDto) {
    return this.adminOrganizationsService.update(id, dto);
  }
}
