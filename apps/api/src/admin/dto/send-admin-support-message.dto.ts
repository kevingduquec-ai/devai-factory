import { IsString, MaxLength, MinLength } from "class-validator";

export class SendAdminSupportMessageDto {
  @IsString()
  @MinLength(1, { message: "Escribe un mensaje" })
  @MaxLength(4000, { message: "El mensaje es demasiado largo" })
  body!: string;
}
