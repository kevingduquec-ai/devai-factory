import { IsBoolean, IsOptional } from "class-validator";

export class UpdateUserAdminDto {
  @IsOptional()
  @IsBoolean()
  singleStoryEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  integrationsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  qaAutomationEnabled?: boolean;
}
