import { IsIn } from "class-validator";

/** Solo starter/team tienen checkout de autoservicio — empresa es venta asistida. */
export class CheckoutDto {
  @IsIn(["starter", "team"], { message: "Plan inválido para autoservicio" })
  plan!: "starter" | "team";
}
