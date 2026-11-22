import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { type CanActivate, type ExecutionContext, type INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard.js';
import { RolesGuard } from '../src/auth/roles.guard.js';
import { PortfolioEntityType } from '@prisma/client';
import { PortfolioAdminController } from '../src/portfolio/portfolio-admin.controller.js';
import { PortfolioAdminService } from '../src/portfolio/portfolio-admin.service.js';
import { PortfolioPublicationService } from '../src/portfolio/portfolio-publication.service.js';
import { PortfolioPublicController } from '../src/portfolio/portfolio-public.controller.js';
import { PortfolioPublicReader } from '../src/portfolio/portfolio-public-reader.js';
import { setupApp } from '../src/setup-app.js';
import { createCorsOptions } from '../src/cors.config.js';
import { createHttpSecurityConfig } from '../src/common/http-security.config.js';

const id = '12345678-1234-4234-8234-123456789012';
class FixtureAuthentication implements CanActivate {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<{ headers: { authorization?: string }; user?: { sub: string; role: string } }>();
    if (!['Bearer fixture-admin', 'Bearer fixture-guest'].includes(req.headers.authorization ?? '')) throw new UnauthorizedException();
    req.user = { sub: id, role: req.headers.authorization === 'Bearer fixture-admin' ? 'ADMIN' : 'GUEST' };
    return true;
  }
}

describe('Portfolio publication HTTP boundaries (no DB)', () => {
  let app: INestApplication;
  const signedUrl = 'https://storage.example/derivative?signature=synthetic';
  const reader = {
    services: jest.fn<PortfolioPublicReader['services']>().mockResolvedValue({
      items: [], nextCursor: null, locale: 'uk', contentVersion: 1,
    }),
    derivative: jest.fn(() => signedUrl),
  };
  const admin = { listServices: jest.fn(), createService: jest.fn(), getService: jest.fn(), updateService: jest.fn(), removeService: jest.fn(), listStories: jest.fn(), createStory: jest.fn(), getStory: jest.fn(), updateStory: jest.fn(), replacePhotos: jest.fn(), removeStory: jest.fn(), getSettings: jest.fn(), updateSettings: jest.fn() };
  const publication = {
    publish: jest.fn().mockImplementation(async () => ({ id, status: 'PUBLISHED', draftVersion: 2, publishedVersion: 2, contentVersion: 4, publishedAt: '2026-11-21T12:00:00.000Z' })),
    archive: jest.fn().mockImplementation(async () => ({ id, status: 'ARCHIVED', draftVersion: 2, publishedVersion: 2, contentVersion: 5, publishedAt: '2026-11-21T12:00:00.000Z' })),
    preview: jest.fn().mockImplementation(async () => ({ draftVersion: 2, site: {}, page: {} })),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [PortfolioAdminController, PortfolioPublicController],
      providers: [
        { provide: PortfolioAdminService, useValue: admin },
        { provide: PortfolioPublicationService, useValue: publication },
        { provide: PortfolioPublicReader, useValue: reader },
        RolesGuard,
      ],
    }).overrideGuard(JwtAuthGuard).useClass(FixtureAuthentication).compile();
    app = module.createNestApplication({ logger: false });
    setupApp(app, false, createCorsOptions('http://localhost:3001'), createHttpSecurityConfig({ RATE_LIMIT_API: '1000' }));
    await app.init();
  });
  afterAll(async () => { await app?.close(); });

  it('names invalid nested draft fields without returning submitted values', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/portfolio/services')
      .set('Authorization', 'Bearer fixture-admin')
      .send({
        slug: 'bad slug',
        title: { uk: 'Чернетка', en: 42 },
        description: { uk: '', en: '' },
        price: null, bookingEnabled: false, cardImage: null,
        seo: { title: { uk: '', en: '' }, description: { uk: '', en: '' }, shareImage: null },
      })
      .expect(400);
    expect(response.body).toMatchObject({
      code: 'VALIDATION_FAILED',
      errors: expect.arrayContaining([{ field: 'slug', code: 'INVALID_FIELD' }, { field: 'title.en', code: 'INVALID_FIELD' }]),
    });
    expect(response.text).not.toContain('bad slug');
    expect(admin.createService).not.toHaveBeenCalled();
  });

  it('serves public metadata and derivative redirects without admin authentication', async () => {
    const base = '/api/v1/public/portfolio';
    await request(app.getHttpServer()).get(base + '/services?locale=uk')
      .expect(200).expect('Cache-Control', 'no-store')
      .expect({ items: [], nextCursor: null, locale: 'uk', contentVersion: 1 });
    expect(reader.services).toHaveBeenCalledWith(expect.objectContaining({ locale: 'uk', limit: 24 }));
    await request(app.getHttpServer()).get(base + '/services?limit=51').expect(400);
    await request(app.getHttpServer()).get(base + '/services?locale=fr').expect(400);
    await request(app.getHttpServer()).get(base + '/media/' + id + '/variants/' + id)
      .expect(302).expect('Cache-Control', 'no-store').expect('Location', signedUrl);
    expect(reader.derivative).toHaveBeenCalledTimes(1);
    await request(app.getHttpServer()).get(base + '/media/invalid/variants/' + id).expect(400);
    expect(reader.derivative).toHaveBeenCalledTimes(1);
  });

  it('protects draft preview and publication/archive commands with ADMIN and no-store', async () => {
    for (const path of [`/api/v1/portfolio/services/${id}/preview`, `/api/v1/portfolio/services/${id}/publish`, `/api/v1/portfolio/stories/${id}/archive`, '/api/v1/portfolio/settings/preview']) {
      const method = path.endsWith('/preview') ? 'get' : 'post';
      await request(app.getHttpServer())[method](path).expect(401).expect('Cache-Control', 'no-store');
      await request(app.getHttpServer())[method](path).set('Authorization', 'Bearer fixture-guest').send({ expectedVersion: 2 }).expect(403);
    }
  });

  it('passes expectedVersion and locale through guarded commands and rejects malformed input', async () => {
    await request(app.getHttpServer()).post(`/api/v1/portfolio/services/${id}/publish`).set('Authorization', 'Bearer fixture-admin').send({ expectedVersion: 2 }).expect(200).expect('Cache-Control', 'no-store');
    expect(publication.publish).toHaveBeenCalledWith(PortfolioEntityType.SERVICE, id, 2);
    await request(app.getHttpServer()).get(`/api/v1/portfolio/stories/${id}/preview?locale=uk`).set('Authorization', 'Bearer fixture-admin').expect(200).expect('Cache-Control', 'no-store');
    expect(publication.preview).toHaveBeenCalledWith(PortfolioEntityType.STORY, id, { locale: 'uk' });
    await request(app.getHttpServer()).post(`/api/v1/portfolio/services/${id}/archive`).set('Authorization', 'Bearer fixture-admin').send({ expectedVersion: 0 }).expect(400);
    await request(app.getHttpServer()).get(`/api/v1/portfolio/settings/preview?locale=fr`).set('Authorization', 'Bearer fixture-admin').expect(400);
    await request(app.getHttpServer()).get('/api/v1/portfolio/services/not-a-uuid/preview').set('Authorization', 'Bearer fixture-admin').expect(400);
  });
});
