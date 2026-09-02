import { IsString, MinLength } from "class-validator";

export class SelectTargetDto {
  @IsString()
  @MinLength(1)
  targetId!: string;

  @IsString()
  @MinLength(1)
  targetLabel!: string;
}
