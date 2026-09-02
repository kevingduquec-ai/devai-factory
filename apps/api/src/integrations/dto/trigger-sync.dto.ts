import { IsString, MinLength } from "class-validator";

export class TriggerSyncDto {
  @IsString()
  @MinLength(1)
  connectionId!: string;
}
