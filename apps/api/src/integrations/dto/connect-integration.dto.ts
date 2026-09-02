import { IsEmail, IsEnum, IsOptional, IsString, MinLength, ValidateIf } from "class-validator";
import { IntegrationProvider } from "@prisma/client";

export class ConnectIntegrationDto {
  @IsEnum(IntegrationProvider)
  provider!: IntegrationProvider;

  @IsString()
  @MinLength(2)
  label!: string;

  @ValidateIf((dto: ConnectIntegrationDto) => dto.provider === "jira")
  @IsString()
  @MinLength(8)
  siteUrl?: string;

  @ValidateIf((dto: ConnectIntegrationDto) => dto.provider === "jira")
  @IsEmail()
  authEmail?: string;

  @IsString()
  @MinLength(10)
  apiToken!: string;
}
