import { IsEnum, IsOptional, IsString, MinLength } from "class-validator";
import { RequirementPriority, RequirementStatus, RequirementType } from "@prisma/client";

export class UpdateRequirementDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  description?: string;

  @IsOptional()
  @IsEnum(RequirementType)
  type?: RequirementType;

  @IsOptional()
  @IsEnum(RequirementPriority)
  priority?: RequirementPriority;

  @IsOptional()
  @IsString()
  actor?: string;

  @IsOptional()
  @IsString()
  businessRules?: string;

  @IsOptional()
  @IsString()
  dependencies?: string;

  @IsOptional()
  @IsString()
  assumptions?: string;

  @IsOptional()
  @IsEnum(RequirementStatus)
  status?: RequirementStatus;
}
