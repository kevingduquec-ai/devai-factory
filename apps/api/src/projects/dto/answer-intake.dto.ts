import { ArrayMinSize, IsArray, IsString } from "class-validator";

export class AnswerIntakeDto {
  @IsArray({ message: "Las respuestas deben enviarse como una lista" })
  @ArrayMinSize(1, { message: "Responde al menos una pregunta" })
  @IsString({ each: true, message: "Cada respuesta debe ser texto" })
  answers!: string[];
}
