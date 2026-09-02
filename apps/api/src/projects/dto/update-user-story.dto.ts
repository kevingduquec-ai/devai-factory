import { IsEnum, IsInt, IsOptional, IsString, Min, MinLength } from "class-validator";
import { RequirementPriority } from "@prisma/client";

export class UpdateUserStoryDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  actor?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  goal?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  benefit?: string;

  @IsOptional()
  @IsEnum(RequirementPriority)
  priority?: RequirementPriority;

  @IsOptional()
  @IsInt()
  @Min(1)
  storyPoints?: number;

  @IsOptional()
  @IsString()
  dependencies?: string;

  @IsOptional()
  @IsString()
  definitionOfReady?: string;

  @IsOptional()
  @IsString()
  definitionOfDone?: string;
}
