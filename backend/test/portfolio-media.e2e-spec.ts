import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import {
  type CanActivate,
  type ExecutionContext,
  type INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard.js';
import { RolesGuard } from '../src/auth/roles.guard.js';
import { PortfolioMediaController } from '../src/portfolio/portfolio-media.controller.js';
import { PortfolioMediaService } from '../src/portfolio/media/portfolio-media.service.js';
import { setupApp } from '../src/setup-app.js';
import { createCorsOptions } from '../src/cors.config.js';
import { createHttpSecurityConfig } from '../src/common/http-security.config.js';

const id = '12345678-1234-4234-8234-123456789012';
const media = {
  id,
  filename: 'synthetic.jpg',
  mimeType: 'image/jpeg',
  sizeBytes: '100',
  width: 480,
  height: 320,
  status: 'READY',
  previewUrl: `/api/portfolio/media/${id}/variants/${id}`,
  createdAt: '2026-11-21T10:00:00.000Z',
};
class FixtureAuthentication implements CanActivate {
  canActivate(context: ExecutionContext) {
    const req = context
      .switchToHttp()
      .getRequest<{ headers: { authorization?: string }; user?: { sub: string; role: string } }>();
    if (!['Bearer fixture-admin', 'Bearer fixture-guest'].includes(req.headers.authorization ?? ''))
      throw new UnauthorizedException();
    req.user = {
      sub: id,
      role: req.headers.authorization === 'Bearer fixture-admin' ? 'ADMIN' : 'GUEST',
    };
    return true;
  }
}
describe('Portfolio media HTTP boundaries (no DB/S3)', () => {
  let app: INestApplication;
  const api = {
    requestUpload: jest
      .fn()
      .mockImplementation(async () => ({
        mediaId: id,
        uploadUrl: 'https://storage.example.invalid/put',
        expiresIn: 900,
        requiredHeaders: { 'Content-Type': 'image/jpeg', 'If-None-Match': '*' },
      })),
    complete: jest.fn().mockImplementation(async () => media),
    retry: jest.fn().mockImplementation(async () => media),
    detail: jest.fn().mockImplementation(async () => media),
    list: jest.fn().mockImplementation(async () => ({ items: [media], nextCursor: null })),
    preview: jest
      .fn()
      .mockImplementation(
        async () => 'https://storage.example.invalid/derivative.webp?signed=fixture',
      ),
    remove: jest.fn().mockImplementation(async () => undefined),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [PortfolioMediaController],
      providers: [{ provide: PortfolioMediaService, useValue: api }, RolesGuard],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(FixtureAuthentication)
      .compile();
    app = module.createNestApplication({ logger: false });
    setupApp(
      app,
      false,
      createCorsOptions('http://localhost:3001'),
      createHttpSecurityConfig({ RATE_LIMIT_API: '1000' }),
    );
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
  });
  it('requires authentication and ADMIN for both metadata and preview', async () => {
    for (const path of ['/portfolio/media', `/portfolio/media/${id}/variants/${id}`]) {
      await request(app.getHttpServer())
        .get(`/api/v1${path}`)
        .expect(401)
        .expect('Cache-Control', 'no-store');
      await request(app.getHttpServer())
        .get(`/api/v1${path}`)
        .set('Authorization', 'Bearer fixture-guest')
        .expect(403);
    }
  });
  it('validates the portfolio 10 MB boundary and forbidden fields before invoking the service', async () => {
    const body = { filename: 'synthetic.jpg', mimeType: 'image/jpeg', sizeBytes: 10_000_000 };
    await request(app.getHttpServer())
      .post('/api/v1/portfolio/media/upload-url')
      .set('Authorization', 'Bearer fixture-admin')
      .send(body)
      .expect(201)
      .expect('Cache-Control', 'no-store');
    expect(api.requestUpload).toHaveBeenCalledTimes(1);
    for (const invalid of [
      { ...body, sizeBytes: 10_000_001 },
      { ...body, originalKey: 'foreign/key' },
      { ...body, status: 'READY' },
    ])
      await request(app.getHttpServer())
        .post('/api/v1/portfolio/media/upload-url')
        .set('Authorization', 'Bearer fixture-admin')
        .send(invalid)
        .expect(400);
    expect(api.requestUpload).toHaveBeenCalledTimes(1);
  });
  it('uses asynchronous completion/retry and returns a redirect rather than derivative bytes', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/portfolio/media/${id}/upload-complete`)
      .set('Authorization', 'Bearer fixture-admin')
      .expect(202);
    await request(app.getHttpServer())
      .post(`/api/v1/portfolio/media/${id}/retry`)
      .set('Authorization', 'Bearer fixture-admin')
      .expect(202);
    await request(app.getHttpServer())
      .get(`/api/v1/portfolio/media/${id}/variants/${id}`)
      .set('Authorization', 'Bearer fixture-admin')
      .expect(302)
      .expect('Cache-Control', 'no-store')
      .expect('Referrer-Policy', 'no-referrer')
      .expect('Location', 'https://storage.example.invalid/derivative.webp?signed=fixture');
    await request(app.getHttpServer())
      .get(`/api/v1/public/portfolio/media/${id}/variants/${id}`)
      .expect(404);
  });
  it('documents guarded media operations and concrete response/error schemas', async () => {
    const response = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
    expect(
      response.body.paths['/api/v1/portfolio/media/upload-url'].post.responses['201'].content[
        'application/json'
      ].schema,
    ).toEqual({ $ref: '#/components/schemas/PortfolioUploadResponseDto' });
    expect(response.body.paths['/api/v1/portfolio/media/{id}/retry'].post.security).toEqual([
      { bearer: [] },
    ]);
  });
});
