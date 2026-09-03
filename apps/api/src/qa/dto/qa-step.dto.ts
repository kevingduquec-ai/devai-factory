import { IsIn, IsOptional, IsString, MinLength } from "class-validator";

const QA_STEP_ACTIONS = ["goto", "click", "fill", "select", "wait_for_text", "assert_text", "assert_url", "assert_element_visible"];

export class QaStepDto {
  @IsIn(QA_STEP_ACTIONS)
  action!: string;

  @IsOptional()
  @IsString()
  selector?: string;

  @IsOptional()
  @IsString()
  value?: string;

  @IsOptional()
  @IsString()
  dataRef?: string;

  @IsString()
  @MinLength(1)
  description!: string;
}
