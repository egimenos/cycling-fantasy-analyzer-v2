import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { json, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './infrastructure/observability/all-exceptions.filter';
import { CorrelationStore } from './infrastructure/observability/correlation.store';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  // Trust exactly one proxy hop (Traefik in prod). `true` would let clients
  // forge X-Forwarded-For and bypass rate limiting; `1` pins req.ip to the
  // real client IP behind our own reverse proxy.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  // Correlation ID middleware — runs before pino-http to populate AsyncLocalStorage
  const correlationStore = app.get(CorrelationStore);
  app.use((req: Request, _res: Response, next: () => void) => {
    const id = (req.headers['x-correlation-id'] as string | undefined) ?? randomUUID();
    req.headers['x-correlation-id'] = id;
    correlationStore.run(id, next);
  });

  app.useGlobalFilters(app.get(AllExceptionsFilter));
  app.use(json({ limit: '5mb' }));

  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
  });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.enableShutdownHooks();

  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
