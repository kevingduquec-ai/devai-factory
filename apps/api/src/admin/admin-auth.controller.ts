import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { AdminAuthService } from "./admin-auth.service";
import { AdminLoginDto } from "./dto/admin-login.dto";

@Controller("admin/auth")
export class AdminAuthController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  @HttpCode(HttpStatus.OK)
  @Post("login")
  login(@Body() dto: AdminLoginDto) {
    return this.adminAuthService.login(dto);
  }
}
