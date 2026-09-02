import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { IntegrationsController } from "./integrations.controller";
import { IntegrationsService } from "./integrations.service";
import { SyncProcessor } from "./sync.processor";
import { SYNC_QUEUE } from "./integrations.constants";

@Module({
  imports: [BullModule.registerQueue({ name: SYNC_QUEUE })],
  controllers: [IntegrationsController],
  providers: [IntegrationsService, SyncProcessor],
})
export class IntegrationsModule {}
