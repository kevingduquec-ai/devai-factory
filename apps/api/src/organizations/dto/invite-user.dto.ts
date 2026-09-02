import { IsEmail, IsIn, IsOptional } from "class-validator";
import { OrgRole } from "@prisma/client";

export class InviteUserDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsIn([OrgRole.admin, OrgRole.member])
  role?: OrgRole;
}
