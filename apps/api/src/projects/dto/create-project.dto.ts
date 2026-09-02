import { IsString, MinLength } from "class-validator";

/** Módulo "Análisis completo" — ver CreateQuickStoryDto para el módulo "Historia de usuario". */
export class CreateProjectDto {
  @IsString()
  @MinLength(2, { message: "Ingresa un nombre para el proyecto" })
  name!: string;

  @IsString()
  @MinLength(10, { message: "Describe la necesidad con al menos 10 caracteres" })
  description!: string;
}
