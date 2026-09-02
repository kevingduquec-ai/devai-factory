import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { AdminAuthController } from "./admin-auth.controller";
import { AdminAuthService } from "./admin-auth.service";
import { AdminOrganizationsController } from "./admin-organizations.controller";
import { AdminOrganizationsService } from "./admin-organizations.service";
import { AdminUsersController } from "./admin-users.controller";
import { AdminUsersService } from "./admin-users.service";
import { AdminSupportController } from "./admin-support.controller";
import { AdminSupportService } from "./admin-support.service";
import { JwtAdminStrategy } from "./strategies/jwt-admin.strategy";

@Module({
  imports: [PassportModule, JwtModule.register({})],
  controllers: [AdminAuthController, AdminOrganizationsController, AdminUsersController, AdminSupportController],
  providers: [AdminAuthService, AdminOrganizationsService, AdminUsersService, AdminSupportService, JwtAdminStrategy],
})
export class AdminModule {}
