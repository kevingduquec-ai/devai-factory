import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";

async function bootstrap() {
  // rawBody: true keeps the raw request buffer available (req.rawBody)
  // alongside normal JSON parsing — the Stripe webhook needs it to verify
  // the signature; every other route ignores it.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.enableCors({ origin: process.env.APP_URL ?? "http://localhost:3000", credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.setGlobalPrefix("api");
  const port = process.env.PORT ?? 4000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`DevAI Factory API listening on http://localhost:${port}/api`);
}
bootstrap();
