import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import {
  ARCHIVE_GENERATION_QUEUE,
  IMAGE_PROCESSING_QUEUE,
} from './../src/queues/queue.constants.js';
import { ImageProcessingWorker } from './../src/image-processing/image-processing.worker.js';
import { ArchiveGenerationWorker } from './../src/archives/archive-generation.worker.js';
import { setupApp } from './../src/setup-app.js';
import { createCorsOptions } from './../src/cors.config.js';
import { AppController } from './../src/app.controller.js';
import { AppService } from './../src/app.service.js';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        $connect: jest.fn(),
        $disconnect: jest.fn(),
        onModuleInit: jest.fn(),
        onModuleDestroy: jest.fn(),
      })
      .overrideProvider(IMAGE_PROCESSING_QUEUE)
      .useValue({ close: jest.fn() })
      .overrideProvider(ARCHIVE_GENERATION_QUEUE)
      .useValue({ close: jest.fn() })
      .overrideProvider(ImageProcessingWorker)
      .useValue({ onModuleDestroy: jest.fn() })
      .overrideProvider(ArchiveGenerationWorker)
      .useValue({ onModuleDestroy: jest.fn() })
      .compile();

    app = moduleFixture.createNestApplication();
    setupApp(
      app,
      true,
      createCorsOptions(
        ' http://localhost:3001, https://photos.example.com/ ',
        'https://api.example.com',
      ),
    );
    await app.init();
  });

  it('/api/v1/health (GET)', () => {
    return request(app.getHttpServer()).get('/api/v1/health').expect(200).expect({ status: 'ok' });
  });

  it('adds browser security headers to API responses', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['cross-origin-resource-policy']).toBe('same-origin');
    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['content-security-policy']).toContain("script-src 'self'");
    expect(response.headers['content-security-policy']).toContain("object-src 'none'");
    expect(response.headers['content-security-policy']).toContain('upgrade-insecure-requests');
    expect(response.headers['strict-transport-security']).toContain('max-age=');
  });

  it.each(['http://localhost:3001', 'https://photos.example.com', 'https://api.example.com'])(
    'allows the exact configured origin %s',
    async (origin) => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/health')
        .set('Origin', origin)
        .expect(200);
      expect(response.headers['access-control-allow-origin']).toBe(origin);
      expect(response.headers.vary).toContain('Origin');
      expect(response.headers['access-control-allow-credentials']).toBeUndefined();
      expect(response.headers['x-content-type-options']).toBe('nosniff');
    },
  );

  it.each([
    'https://untrusted.example',
    'https://photos.example.com.attacker.example',
    'http://photos.example.com',
    'https://photos.example.com:8443',
    'null',
  ])('rejects an unapproved Origin on actual requests and preflights: %s', async (origin) => {
    for (const method of ['get', 'options'] as const) {
      const client = request(app.getHttpServer());
      const response = await client[method]('/api/v1/health').set('Origin', origin).expect(403);
      expect(response.body).toEqual({
        statusCode: 403,
        code: 'CORS_ORIGIN_DENIED',
        message: 'Origin is not allowed',
      });
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
      expect(response.headers['x-content-type-options']).toBe('nosniff');
    }
  });

  it('handles JSON/Bearer-token preflights before authentication', async () => {
    const response = await request(app.getHttpServer())
      .options('/api/v1/galleries')
      .set('Origin', 'https://photos.example.com')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'authorization,content-type')
      .expect(204);
    expect(response.headers['access-control-allow-origin']).toBe('https://photos.example.com');
    expect(response.headers['access-control-allow-methods']).toContain('POST');
    expect(response.headers['access-control-allow-methods']).not.toContain('PUT');
    expect(response.headers['access-control-allow-headers']).toBe('Authorization,Content-Type');
    expect(response.headers['access-control-max-age']).toBe('600');
    // CORS permission does not bypass the actual endpoint's JWT guard.
    const unauthorized = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Origin', 'https://photos.example.com')
      .expect(401);
    expect(unauthorized.headers['access-control-allow-origin']).toBe('https://photos.example.com');
  });

  it('preserves server-to-server requests without exposing a wildcard origin', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect(response.headers.vary).toContain('Origin');
    await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
  });

  it('also protects unauthenticated responses and unknown routes', async () => {
    for (const [path, status] of [
      ['/api/v1/auth/me', 401],
      ['/api/v1/not-found', 404],
    ] as const) {
      const response = await request(app.getHttpServer()).get(path).expect(status);
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['referrer-policy']).toBe('no-referrer');
      expect(response.headers['x-powered-by']).toBeUndefined();
    }
  });

  it('serves Swagger HTML, scripts and OpenAPI JSON under the security policy', async () => {
    const docs = await request(app.getHttpServer()).get('/api/docs/').expect(200);
    expect(docs.headers['content-security-policy']).toContain("script-src 'self'");
    expect(docs.text).toContain('swagger-ui-init.js');
    expect(docs.text).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>\s*\S/);
    await request(app.getHttpServer()).get('/api/docs/swagger-ui-init.js').expect(200);
    await request(app.getHttpServer()).get('/api/docs/swagger-ui-bundle.js').expect(200);
    const schema = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
    expect(schema.body.paths).toHaveProperty('/api/v1/health');
  });

  afterEach(async () => {
    await app.close();
  });
});

it('keeps local HTTP usable while retaining the other Helmet protections', async () => {
  const module = await Test.createTestingModule({
    controllers: [AppController],
    providers: [AppService],
  }).compile();
  const localApp = module.createNestApplication();
  setupApp(localApp, false);
  try {
    await localApp.init();
    const response = await request(localApp.getHttpServer()).get('/api/v1/health').expect(200);
    expect(response.headers['strict-transport-security']).toBeUndefined();
    expect(response.headers['content-security-policy']).not.toContain('upgrade-insecure-requests');
    expect(response.headers['content-security-policy']).toContain("script-src 'self'");
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
  } finally {
    await localApp.close();
  }
});
