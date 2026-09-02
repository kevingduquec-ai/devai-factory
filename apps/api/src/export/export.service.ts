import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { TenantPrismaService } from "../prisma/tenant-prisma.service";
import { buildDocx } from "./docx-builder";
import { buildPdf } from "./pdf-builder";
import type { ExportBundle } from "./export.types";

const STORAGE_DIR = join(process.cwd(), "storage", "exports");
const MIME_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

@Injectable()
export class ExportService {
  constructor(private readonly tenant: TenantPrismaService) {}

  private async loadBundle(projectId: string): Promise<ExportBundle> {
    const db = this.tenant.client;
    const project = await db.project.findUnique({ where: { id: projectId } });
    if (!project) {
      throw new NotFoundException("Proyecto no encontrado");
    }

    const [requirements, stories, dataModel, apiEndpoints, testCases] = await Promise.all([
      db.requirement.findMany({ where: { projectId }, orderBy: { code: "asc" } }),
      db.userStory.findMany({
        where: { projectId },
        include: { acceptanceCriteria: true, requirement: { select: { code: true } } },
        orderBy: { createdAt: "asc" },
      }),
      db.dataModelEntity.findMany({ where: { projectId }, orderBy: { name: "asc" } }),
      db.apiEndpoint.findMany({ where: { projectId }, orderBy: { path: "asc" } }),
      db.testCase.findMany({
        where: { projectId },
        include: { acceptanceCriterion: { select: { given: true, when: true, then: true } } },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    return {
      project,
      requirements,
      stories: stories as unknown as ExportBundle["stories"],
      dataModel,
      apiEndpoints,
      testCases: testCases as unknown as ExportBundle["testCases"],
    };
  }

  async generate(projectId: string, format: "pdf" | "docx") {
    const bundle = await this.loadBundle(projectId);
    if (bundle.requirements.length === 0) {
      throw new BadRequestException("Este proyecto todavía no tiene un paquete generado para exportar");
    }

    const buffer = format === "docx" ? await buildDocx(bundle) : await buildPdf(bundle);

    const dir = join(STORAGE_DIR, projectId);
    await mkdir(dir, { recursive: true });
    const filename = `${randomUUID()}.${format}`;
    await writeFile(join(dir, filename), buffer);

    return this.tenant.client.documentExported.create({
      data: { projectId, type: format, fileUrl: filename },
    });
  }

  async listDocuments(projectId: string) {
    const exists = await this.tenant.client.project.findUnique({ where: { id: projectId } });
    if (!exists) {
      throw new NotFoundException("Proyecto no encontrado");
    }
    return this.tenant.client.documentExported.findMany({
      where: { projectId },
      orderBy: { generatedAt: "desc" },
    });
  }

  async readDocumentFile(projectId: string, documentId: string) {
    const doc = await this.tenant.client.documentExported.findUnique({ where: { id: documentId } });
    if (!doc || doc.projectId !== projectId) {
      throw new NotFoundException("Documento no encontrado");
    }
    const project = await this.tenant.client.project.findUnique({ where: { id: projectId } });
    const filePath = join(STORAGE_DIR, projectId, doc.fileUrl);
    const buffer = await readFile(filePath);
    const safeName = (project?.name ?? "proyecto").replace(/[^a-zA-Z0-9-_ ]/g, "").trim() || "proyecto";
    return { buffer, mimeType: MIME_TYPES[doc.type], filename: `${safeName}.${doc.type}` };
  }
}
