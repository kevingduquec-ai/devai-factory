import { IsString, MinLength } from "class-validator";

export class CreateQuickStoryDto {
  @IsString()
  @MinLength(3, { message: "Ingresa un título para la historia" })
  title!: string;

  @IsString()
  @MinLength(10, { message: "Describe la necesidad con al menos 10 caracteres" })
  description!: string;
}
