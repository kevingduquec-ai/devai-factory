import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Body, Controller, Get, NotFoundException, Param, Patch, Post, Res, StreamableFile, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { QaService } from "./qa.service";
import { CreateQaModuleDto } from "./dto/create-qa-module.dto";
import { UpdateSetupStepsDto } from "./dto/update-setup-steps.dto";
import { ResolveMissingDataDto } from "./dto/resolve-missing-data.dto";

const REPORT_DIR = join(process.cwd(), "storage", "qa-reports");

@UseGuards(JwtAuthGuard)
@Controller("qa")
export class QaController {
  constructor(private readonly qaService: QaService) {}

  @Get("modules")
  listModules() {
    return this.qaService.listModules();
  }

  @Post("modules")
  createModule(@Body() dto: CreateQaModuleDto) {
    return this.qaService.createModule(dto);
  }

  @Get("modules/:id")
  getModule(@Param("id") id: string) {
    return this.qaService.getModule(id);
  }

  @Patch("modules/:id/setup-steps")
  updateSetupSteps(@Param("id") id: string, @Body() dto: UpdateSetupStepsDto) {
    return this.qaService.updateSetupSteps(id, dto);
  }

  @Post("modules/:id/generate-cases")
  generateCases(@Param("id") id: string) {
    return this.qaService.generateCases(id);
  }

  @Post("test-cases/:id/approve")
  approveCase(@Param("id") id: string) {
    return this.qaService.approveCase(id);
  }

  @Get("missing-data")
  listMissingData() {
    return this.qaService.listMissingData();
  }

  @Post("missing-data/:id/resolve")
  resolveMissingData(@Param("id") id: string, @Body() dto: ResolveMissingDataDto) {
    return this.qaService.resolveMissingData(id, dto);
  }

  @Post("modules/:id/runs")
  triggerRun(@Param("id") id: string) {
    return this.qaService.triggerRun(id);
  }

  @Get("modules/:id/runs")
  listRuns(@Param("id") id: string) {
    return this.qaService.listRuns(id);
  }

  @Get("runs/:id")
  getRun(@Param("id") id: string) {
    return this.qaService.getRun(id);
  }

  @Get("runs/:id/report")
  async downloadReport(@Param("id") id: string, @Res({ passthrough: true }) res: Response) {
    const filename = await this.qaService.getReportFile(id);
    const filePath = join(REPORT_DIR, filename);
    try {
      const buffer = await readFile(filePath);
      res.set({ "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"` });
      return new StreamableFile(buffer);
    } catch {
      throw new NotFoundException("El archivo del reporte no está disponible");
    }
  }
}
