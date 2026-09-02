import { IsEmail, IsString } from "class-validator";

export class LoginDto {
  @IsEmail({}, { message: "Ingresa un correo válido" })
  email!: string;

  @IsString({ message: "Ingresa tu contraseña" })
  password!: string;
}
