import { IsEmail, IsString, MinLength } from "class-validator";

export class RegisterDto {
  @IsEmail({}, { message: "Ingresa un correo válido" })
  email!: string;

  @IsString()
  @MinLength(8, { message: "La contraseña debe tener al menos 8 caracteres" })
  password!: string;

  @IsString()
  @MinLength(2, { message: "Ingresa tu nombre" })
  name!: string;

  @IsString()
  @MinLength(2, { message: "Ingresa el nombre de tu empresa" })
  organizationName!: string;
}
