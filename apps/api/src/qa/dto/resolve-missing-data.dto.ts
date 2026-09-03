import { IsString, MinLength } from "class-validator";

export class ResolveMissingDataDto {
  @IsString()
  @MinLength(1)
  value!: string;
}
