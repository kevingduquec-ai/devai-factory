import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, ValidateNested } from "class-validator";
import { QaStepDto } from "./qa-step.dto";

export class UpdateSetupStepsDto {
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => QaStepDto)
  setupSteps!: QaStepDto[];
}
