// Load .env before any module is imported: entity decorators (e.g.
// WaitlistEntry) read DB_TYPE at import time, before ConfigModule runs.
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  const origins = corsOrigins();
  app.enableCors({
    // No origins configured (local dev): reflect any origin.
    origin: origins.length ? origins : true,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  const doc = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('The Round API')
      .setDescription('Backend for The Round — clinical speaking practice.')
      .setVersion('1.0')
      .addBearerAuth()
      .build(),
  );
  // UI at /api/docs, raw spec at /api/docs-json
  SwaggerModule.setup('docs', app, doc, {
    useGlobalPrefix: true,
    swaggerOptions: { persistAuthorization: true },
  });

  await app.listen(process.env.PORT ?? 3000);
}
/**
 * Browser origins allowed to call the API: the three front-ends (landing page,
 * user dashboard, admin dashboard) plus any extras in comma-separated
 * CORS_ORIGIN. Values are normalised to bare origins, so a trailing slash or
 * path in the env doesn't break matching.
 */
function corsOrigins(): string[] {
  const raw = [
    process.env.LANDING_URL,
    process.env.APP_URL,
    process.env.ADMIN_URL,
    ...(process.env.CORS_ORIGIN?.split(',') ?? []),
  ];
  const origins = new Set<string>();
  for (const value of raw) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    try {
      origins.add(new URL(trimmed).origin);
    } catch {
      throw new Error(`Invalid URL in CORS config: "${trimmed}"`);
    }
  }
  return [...origins];
}

void bootstrap();
