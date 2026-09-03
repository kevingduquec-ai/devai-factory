import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsEmail, IsIn, IsOptional, IsString, IsUrl, MinLength, ValidateNested } from "class-validator";
import { QaStepDto } from "./qa-step.dto";

export class CreateQaModuleDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsUrl({ require_tld: false, protocols: ["http", "https"], require_protocol: true })
  targetUrl!: string;

  @IsOptional()
  @IsIn(["scoped", "full"])
  scopeMode?: string;

  @IsString()
  @MinLength(10)
  description!: string;

  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => QaStepDto)
  setupSteps!: QaStepDto[];

  /**
   * Atajo "solo con la URL": si se dan credenciales y setupSteps viene
   * vacío, el sistema detecta el formulario de login en targetUrl y arma
   * la precondición solo — el usuario no tiene que armar los pasos a mano.
   */
  @IsOptional()
  @IsEmail()
  loginEmail?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  loginPassword?: string;
}
