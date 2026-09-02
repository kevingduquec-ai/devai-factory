import { ArrayMinSize, IsArray, IsEnum, IsOptional, IsString, MinLength } from "class-validator";
import { TestCaseSeverity, TestCaseStatus, TestCaseType } from "@prisma/client";

export class UpdateTestCaseDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  title?: string;

  @IsOptional()
  @IsEnum(TestCaseType)
  type?: TestCaseType;

  @IsOptional()
  @IsString()
  precondition?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  steps?: string[];

  @IsOptional()
  @IsString()
  testData?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  expectedResult?: string;

  @IsOptional()
  @IsString()
  actualResult?: string;

  @IsOptional()
  @IsEnum(TestCaseStatus)
  status?: TestCaseStatus;

  @IsOptional()
  @IsEnum(TestCaseSeverity)
  severity?: TestCaseSeverity;
}
