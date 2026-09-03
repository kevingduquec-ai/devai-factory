import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { BullModule } from "@nestjs/bullmq";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { OrganizationsModule } from "./organizations/organizations.module";
import { ProjectsModule } from "./projects/projects.module";
import { ExportModule } from "./export/export.module";
import { EmailModule } from "./email/email.module";
import { BillingModule } from "./billing/billing.module";
import { AdminModule } from "./admin/admin.module";
import { SupportModule } from "./support/support.module";
import { IntegrationsModule } from "./integrations/integrations.module";
import { QaModule } from "./qa/qa.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redisUrl = new URL(config.getOrThrow<string>("REDIS_URL"));
        return {
          connection: {
            host: redisUrl.hostname,
            port: Number(redisUrl.port || 6379),
            password: redisUrl.password || undefined,
          },
        };
      },
    }),
    PrismaModule,
    EmailModule,
    AuthModule,
    OrganizationsModule,
    ProjectsModule,
    ExportModule,
    BillingModule,
    AdminModule,
    SupportModule,
    IntegrationsModule,
    QaModule,
  ],
})
export class AppModule {}
