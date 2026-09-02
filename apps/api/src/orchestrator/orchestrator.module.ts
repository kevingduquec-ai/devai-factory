import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { ClaudeClient } from "./claude-client";
import { GenerationProcessor } from "./generation.processor";
import { GENERATION_QUEUE } from "./orchestrator.constants";

@Module({
  imports: [BullModule.registerQueue({ name: GENERATION_QUEUE })],
  providers: [ClaudeClient, GenerationProcessor],
  exports: [ClaudeClient, BullModule],
})
export class OrchestratorModule {}
