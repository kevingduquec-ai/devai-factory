import { IsIn } from "class-validator";

export class ExportProjectDto {
  @IsIn(["pdf", "docx"], { message: "El formato debe ser pdf o docx" })
  format!: "pdf" | "docx";
}
