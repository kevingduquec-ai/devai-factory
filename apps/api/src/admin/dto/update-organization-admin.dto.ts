import { IsBoolean, IsIn, IsOptional } from "class-validator";
import { SubscriptionPlan } from "@devai-factory/shared-types";

export class UpdateOrganizationAdminDto {
  @IsOptional()
  @IsIn(Object.values(SubscriptionPlan))
  plan?: string;

  @IsOptional()
  @IsBoolean()
  suspended?: boolean;

  @IsOptional()
  @IsBoolean()
  subscriptionActive?: boolean;
}
