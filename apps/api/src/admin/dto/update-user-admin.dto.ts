import { IsBoolean } from "class-validator";

export class UpdateUserAdminDto {
  @IsBoolean()
  singleStoryEnabled!: boolean;
}
