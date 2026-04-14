import { Controller, Get, INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import helmet from 'helmet';
import request from 'supertest';

// Real HTTP integration test: boots a minimal Nest app with helmet wired the
// same way as main.ts and asserts the response carries the hardening headers
// we care about for a JSON-only API.

@Controller('dummy')
class DummyController {
  @Get('ping')
  ping() {
    return { ok: true };
  }
}

@Module({ controllers: [DummyController] })
class DummyModule {}

describe('helmet security headers', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [DummyModule] }).compile();
    app = module.createNestApplication();
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
    app.use(helmet());
    app.enableCors({ origin: 'https://app.example.com' });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('sets X-Content-Type-Options: nosniff', async () => {
    const res = await request(app.getHttpServer()).get('/dummy/ping');
    expect(res.status).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('sets a Referrer-Policy header', async () => {
    const res = await request(app.getHttpServer()).get('/dummy/ping');
    expect(res.headers['referrer-policy']).toBeDefined();
  });

  it('emits Strict-Transport-Security when the request is forwarded as HTTPS', async () => {
    const res = await request(app.getHttpServer())
      .get('/dummy/ping')
      .set('X-Forwarded-Proto', 'https');
    expect(res.headers['strict-transport-security']).toMatch(/max-age=/);
  });

  it('removes the X-Powered-By header', async () => {
    const res = await request(app.getHttpServer()).get('/dummy/ping');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('honors the configured CORS origin on a preflight request', async () => {
    const res = await request(app.getHttpServer())
      .options('/dummy/ping')
      .set('Origin', 'https://app.example.com')
      .set('Access-Control-Request-Method', 'GET');
    expect(res.headers['access-control-allow-origin']).toBe('https://app.example.com');
  });
});
