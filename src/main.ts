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
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? true,
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
void bootstrap();
