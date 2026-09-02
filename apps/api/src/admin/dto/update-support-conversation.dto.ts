import { IsBoolean } from "class-validator";

export class UpdateSupportConversationDto {
  @IsBoolean()
  closed!: boolean;
}
