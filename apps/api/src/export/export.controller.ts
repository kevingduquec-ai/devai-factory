import { Controller, Get, Param, Post, Res, StreamableFile, UseGuards, Body } from "@nestjs/common";
import type { Response } from "express";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { ExportService } from "./export.service";
import { ExportProjectDto } from "./dto/export-project.dto";

@UseGuards(JwtAuthGuard)
@Controller("projects")
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Post(":id/export")
  generate(@Param("id") id: string, @Body() dto: ExportProjectDto) {
    return this.exportService.generate(id, dto.format);
  }

  @Get(":id/documents")
  list(@Param("id") id: string) {
    return this.exportService.listDocuments(id);
  }

  @Get(":id/documents/:documentId/download")
  async download(
    @Param("id") id: string,
    @Param("documentId") documentId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { buffer, mimeType, filename } = await this.exportService.readDocumentFile(id, documentId);
    res.set({
      "Content-Type": mimeType,
      "Content-Disposition": `attachment; filename="${filename}"`,
    });
    return new StreamableFile(buffer);
  }
}
