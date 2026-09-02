import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { IntegrationsService } from "./integrations.service";
import { ConnectIntegrationDto } from "./dto/connect-integration.dto";
import { SelectTargetDto } from "./dto/select-target.dto";
import { TriggerSyncDto } from "./dto/trigger-sync.dto";

@UseGuards(JwtAuthGuard)
@Controller("integrations")
export class IntegrationsController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  @Get("connections")
  listConnections() {
    return this.integrationsService.listConnections();
  }

  @Post("connections")
  connect(@Body() dto: ConnectIntegrationDto) {
    return this.integrationsService.connect(dto);
  }

  @Post("connections/:id/rediscover")
  rediscover(@Param("id") id: string) {
    return this.integrationsService.rediscover(id);
  }

  @Patch("connections/:id/target")
  selectTarget(@Param("id") id: string, @Body() dto: SelectTargetDto) {
    return this.integrationsService.selectTarget(id, dto);
  }

  @Post("connections/:id/confirm")
  confirmMapping(@Param("id") id: string) {
    return this.integrationsService.confirmMapping(id);
  }

  @Delete("connections/:id")
  disconnect(@Param("id") id: string) {
    return this.integrationsService.disconnect(id);
  }

  @Post("projects/:projectId/sync")
  triggerSync(@Param("projectId") projectId: string, @Body() dto: TriggerSyncDto) {
    return this.integrationsService.triggerSync(projectId, dto);
  }

  @Get("projects/:projectId/sync-runs")
  listSyncRuns(@Param("projectId") projectId: string) {
    return this.integrationsService.listSyncRuns(projectId);
  }

  @Get("sync-runs/:id")
  getSyncRun(@Param("id") id: string) {
    return this.integrationsService.getSyncRun(id);
  }
}
