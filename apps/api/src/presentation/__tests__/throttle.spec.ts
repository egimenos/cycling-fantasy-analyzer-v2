import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { AnalyzeController } from '../analyze.controller';
import { HealthController } from '../health.controller';
import { AnalyzePriceListUseCase } from '../../application/analyze/analyze-price-list.use-case';
import { ImportPriceListUseCase } from '../../application/analyze/import-price-list.use-case';
import { DRIZZLE } from '../../infrastructure/database/drizzle.provider';

// Real HTTP integration test: fires bursts of requests through a minimal Nest
// app to confirm the global ThrottlerGuard enforces per-route overrides and
// that @SkipThrottle on HealthController keeps probes unrestricted.

describe('Rate limiting (ThrottlerGuard)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    delete process.env.THROTTLE_DISABLE;

    const module = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot({
          throttlers: [{ name: 'default', ttl: 60_000, limit: 60 }],
          skipIf: () => process.env.THROTTLE_DISABLE === 'true',
        }),
      ],
      controllers: [AnalyzeController, HealthController],
      providers: [
        { provide: AnalyzePriceListUseCase, useValue: { execute: jest.fn() } },
        {
          provide: ImportPriceListUseCase,
          useValue: { execute: jest.fn().mockResolvedValue({ riders: [] }) },
        },
        { provide: DRIZZLE, useValue: { execute: jest.fn().mockResolvedValue(undefined) } },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns 429 after 15 requests/min on /api/import-price-list', async () => {
    const server = app.getHttpServer();
    const url = '/api/import-price-list?url=https://grandesminivueltas.com/precios/2026';

    const statuses: number[] = [];
    for (let i = 0; i < 16; i++) {
      const res = await request(server).get(url);
      statuses.push(res.status);
    }

    const okCount = statuses.filter((s) => s === 200).length;
    const throttledCount = statuses.filter((s) => s === 429).length;

    expect(okCount).toBe(15);
    expect(throttledCount).toBe(1);
  });

  it('never throttles /health/liveness even under sustained load', async () => {
    const server = app.getHttpServer();

    const statuses: number[] = [];
    for (let i = 0; i < 80; i++) {
      const res = await request(server).get('/health/liveness');
      statuses.push(res.status);
    }

    expect(statuses.every((s) => s === 200)).toBe(true);
  });

  it('skips throttling entirely when THROTTLE_DISABLE=true', async () => {
    process.env.THROTTLE_DISABLE = 'true';
    const server = app.getHttpServer();
    const url = '/api/import-price-list?url=https://grandesminivueltas.com/precios/2026';

    const statuses: number[] = [];
    for (let i = 0; i < 20; i++) {
      const res = await request(server).get(url);
      statuses.push(res.status);
    }

    expect(statuses.every((s) => s === 200)).toBe(true);
  });
});
