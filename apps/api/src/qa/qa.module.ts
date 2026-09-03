import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { OrchestratorModule } from "../orchestrator/orchestrator.module";
import { QaController } from "./qa.controller";
import { QaService } from "./qa.service";
import { QaRunProcessor } from "./qa-run.processor";
import { QA_RUN_QUEUE } from "./qa.constants";

@Module({
  imports: [OrchestratorModule, BullModule.registerQueue({ name: QA_RUN_QUEUE })],
  controllers: [QaController],
  providers: [QaService, QaRunProcessor],
})
export class QaModule {}
