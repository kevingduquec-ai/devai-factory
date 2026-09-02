import { Body, Controller, Param, Patch, UseGuards } from "@nestjs/common";
import { AdminAuthGuard } from "./guards/admin-auth.guard";
import { AdminUsersService } from "./admin-users.service";
import { UpdateUserAdminDto } from "./dto/update-user-admin.dto";

@UseGuards(AdminAuthGuard)
@Controller("admin/users")
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateUserAdminDto) {
    return this.adminUsersService.update(id, dto);
  }
}
