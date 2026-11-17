import {
  Body,
  Controller,
  Get,
  INestApplication,
  Logger,
  Param,
  Post,
  Query,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';
import { gzipSync } from 'node:zlib';
import { createHmac, randomUUID } from 'node:crypto';
import { setupApp } from '../src/setup-app.js';
import { createCorsOptions } from '../src/cors.config.js';
import { createHttpSecurityConfig } from '../src/common/http-security.config.js';
import { LoginDto } from '../src/auth/dto/login.dto.js';
import { ListPhotosQueryDto } from '../src/photos/dto/list-photos-query.dto.js';
import { RequestPhotoUploadDto } from '../src/photos/dto/request-photo-upload.dto.js';
import { RequestSelectedArchiveDto } from '../src/public-gallery/dto/public-archive.dto.js';

@Controller()
class SecurityFixtureController {
  @Post('auth/login') login(@Body() dto: LoginDto) {
    return { email: dto.email };
  }
  @Post('auth/refresh') refresh() {
    return { ok: true };
  }
  @Get('public/galleries/:token/photos') photos(@Query() query: ListPhotosQueryDto) {
    return { limit: query.limit };
  }
  @Get('public/galleries/:token') gallery(@Param('token') token: string) {
    return { id: token };
  }
  @Post('public/galleries/:token/archives') archive(@Body() dto: RequestSelectedArchiveDto) {
    return { count: dto.photoIds.length, status: 'PENDING' };
  }
  @Post('galleries/:id/photos/upload-url') upload(@Body() dto: RequestPhotoUploadDto) {
    return { size: dto.size, uploadUrl: 'https://storage.example/signed' };
  }
  @Get('health') health() {
    return { status: 'ok' };
  }
  @Get('failure') failure() {
    throw new Error('password=secret JWT=private-token C:/private/key AWS_SECRET=secret');
  }
  @Get('unavailable') unavailable() {
    throw new ServiceUnavailableException('database-password=secret internal-host');
  }
}

describe('HTTP security boundaries', () => {
  let app: INestApplication;
  const login = { email: 'admin@example.com', password: 'secret-password' };
  const config = () =>
    createHttpSecurityConfig({
      HTTP_BODY_LIMIT_BYTES: '25000',
      RATE_LIMIT_AUTH: '2',
      RATE_LIMIT_PUBLIC: '3',
      RATE_LIMIT_ARCHIVE: '1',
      RATE_LIMIT_API: '20',
      BFF_TRUST_SECRET: 'http-test-only-secret-at-least-32-bytes',
    });
  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [SecurityFixtureController],
    }).compile();
    app = module.createNestApplication({ bodyParser: false });
    setupApp(app, true, createCorsOptions('https://photos.example'), config());
    await app.init();
  });
  afterEach(async () => {
    await app.close();
    jest.restoreAllMocks();
  });

  it('shares the auth quota across login/refresh and rejects spoofed forwarded addresses', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', '192.0.2.1')
      .send(login)
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('X-Forwarded-For', '192.0.2.2')
      .send({})
      .expect(201);
    const blocked = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', 'https://photos.example')
      .set('X-Forwarded-For', '192.0.2.3')
      .send(login)
      .expect(429);
    expect(blocked.body).toEqual({
      statusCode: 429,
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests; please try again later',
    });
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect(blocked.headers['ratelimit']).toBeDefined();
    expect(blocked.headers['access-control-allow-origin']).toBe('https://photos.example');
    expect(blocked.headers['x-content-type-options']).toBe('nosniff');
    for (let i = 0; i < 5; i++)
      await request(app.getHttpServer()).get('/api/v1/health').expect(200);
  });

  it('uses independently authenticated client IPs through a common BFF HTTP connection', async () => {
    const proof = (ip: string) => {
      const time = String(Date.now());
      return {
        'X-Photo-Client-IP': ip,
        'X-Photo-Client-Time': time,
        'X-Photo-Client-Signature': createHmac('sha256', 'http-test-only-secret-at-least-32-bytes')
          .update(JSON.stringify(['photo-cloud-client-v1', ip, time, 'POST', '/api/v1/auth/login']))
          .digest('hex'),
      };
    };
    const http = request(app.getHttpServer());
    await http.post('/api/v1/auth/login').set(proof('192.0.2.10')).send(login).expect(201);
    await http.post('/api/v1/auth/login').set(proof('192.0.2.10')).send(login).expect(201);
    await http.post('/api/v1/auth/login').set(proof('192.0.2.10')).send(login).expect(429);
    await http.post('/api/v1/auth/login').set(proof('192.0.2.20')).send(login).expect(201);
    await http
      .post('/api/v1/auth/login')
      .set({ ...proof('192.0.2.10'), 'X-Photo-Client-IP': '192.0.2.30' })
      .send(login)
      .expect(403);
  });

  it('keeps archive, public read and admin quotas separate while preventing token rotation bypass', async () => {
    for (const token of ['a', 'b', 'c'])
      await request(app.getHttpServer()).get(`/api/v1/public/galleries/${token}`).expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/public/galleries/new-token?cache=1')
      .expect(429);
    await request(app.getHttpServer())
      .post('/api/v1/public/galleries/a/archives')
      .send({ photoIds: [randomUUID()] })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/public/galleries/b/archives')
      .send({ photoIds: [randomUUID()] })
      .expect(429);
    await request(app.getHttpServer())
      .post('/api/v1/galleries/id/photos/upload-url')
      .send({ filename: 'photo.jpg', mimeType: 'image/jpeg', size: 123 })
      .expect(201);
  });

  it('does not charge CORS preflights against API quotas', async () => {
    for (let i = 0; i < 5; i++)
      await request(app.getHttpServer())
        .options('/api/v1/auth/login')
        .set('Origin', 'https://photos.example')
        .set('Access-Control-Request-Method', 'POST')
        .expect(204);
    await request(app.getHttpServer()).post('/api/v1/auth/login').send(login).expect(201);
  });

  it('rejects extra fields and invalid bodies without echoing credentials', async () => {
    const result = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ ...login, role: 'ADMIN', token: 'private-token' })
      .expect(400);
    expect(result.body).toEqual({
      statusCode: 400,
      code: 'VALIDATION_FAILED',
      message: 'Request validation failed',
    });
    expect(JSON.stringify(result.body)).not.toContain(login.password);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'invalid', password: 123 })
      .expect(400);
  });

  it('transforms pagination numbers and rejects invalid or unknown query fields', async () => {
    const result = await request(app.getHttpServer())
      .get('/api/v1/public/galleries/a/photos?limit=24')
      .expect(200);
    expect(result.body.limit).toBe(24);
    await request(app.getHttpServer()).get('/api/v1/public/galleries/a/photos?limit=0').expect(400);
    await request(app.getHttpServer())
      .get('/api/v1/public/galleries/a/photos?limit=101')
      .expect(400);
  });

  it('rejects oversized JSON and compressed bodies while keeping Helmet and CORS headers', async () => {
    const result = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', 'https://photos.example')
      .send({ ...login, padding: 'x'.repeat(26000) })
      .expect(413);
    expect(result.body.code).toBe('PAYLOAD_TOO_LARGE');
    expect(result.headers['x-content-type-options']).toBe('nosniff');
    expect(result.headers['access-control-allow-origin']).toBe('https://photos.example');
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .set('Content-Encoding', 'gzip')
      .send(gzipSync(JSON.stringify(login)))
      .expect(415);
  });

  it('returns a safe error for malformed JSON, without parser payloads', async () => {
    const result = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"password":"private-token", broken')
      .expect(400);
    expect(result.body).toEqual({
      statusCode: 400,
      code: 'INVALID_JSON',
      message: 'Malformed JSON body',
    });
    expect(JSON.stringify(result.body)).not.toContain('private-token');
  });

  it('accepts all 500 selected photo IDs and legitimate upload metadata within the size limit', async () => {
    const result = await request(app.getHttpServer())
      .post('/api/v1/public/galleries/a/archives')
      .send({ photoIds: Array.from({ length: 500 }, () => randomUUID()) })
      .expect(201);
    expect(result.body.count).toBe(500);
    const upload = await request(app.getHttpServer())
      .post('/api/v1/galleries/id/photos/upload-url')
      .send({ filename: 'photo.jpg', mimeType: 'image/jpeg', size: 12345678 })
      .expect(201);
    expect(upload.body.uploadUrl).toBe('https://storage.example/signed');
  });

  it('hides unexpected exceptions and 5xx details, with safe correlated logging', async () => {
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    const result = await request(app.getHttpServer())
      .get('/api/v1/failure?token=private-token')
      .expect(500);
    expect(result.body).toEqual({
      statusCode: 500,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
    });
    expect(result.headers['x-request-id']).toBeDefined();
    const unavailable = await request(app.getHttpServer()).get('/api/v1/unavailable').expect(503);
    expect(unavailable.body.message).toBe('Service is temporarily unavailable');
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).not.toMatch(/password|secret|private-token|internal-host/);
    expect(logged).toContain(result.headers['x-request-id']);
    const missing = await request(app.getHttpServer())
      .get('/api/v1/missing/private-token')
      .expect(404);
    expect(JSON.stringify(missing.body)).not.toContain('private-token');
  });

  it('documents the unified error schema and retry headers in OpenAPI', async () => {
    const result = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
    expect(result.body.components.schemas.ApiErrorDto).toBeDefined();
    expect(
      result.body.paths['/api/v1/auth/login'].post.responses['429'].headers['Retry-After'],
    ).toBeDefined();
    expect(
      result.body.paths['/api/v1/auth/login'].post.responses['413'].content['application/json']
        .schema.$ref,
    ).toContain('ApiErrorDto');
  });
});
