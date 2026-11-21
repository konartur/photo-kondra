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
  const admin = { listServices: jest.fn(), createService: jest.fn(), getService: jest.fn(), updateService: jest.fn(), removeService: jest.fn(), listStories: jest.fn(), createStory: jest.fn(), getStory: jest.fn(), updateStory: jest.fn(), replacePhotos: jest.fn(), removeStory: jest.fn(), getSettings: jest.fn(), updateSettings: jest.fn() };
  const publication = {
    publish: jest.fn().mockImplementation(async () => ({ id, status: 'PUBLISHED', draftVersion: 2, publishedVersion: 2, contentVersion: 4, publishedAt: '2026-11-21T12:00:00.000Z' })),
    archive: jest.fn().mockImplementation(async () => ({ id, status: 'ARCHIVED', draftVersion: 2, publishedVersion: 2, contentVersion: 5, publishedAt: '2026-11-21T12:00:00.000Z' })),
    preview: jest.fn().mockImplementation(async () => ({ draftVersion: 2, site: {}, page: {} })),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [PortfolioAdminController],
      providers: [
        { provide: PortfolioAdminService, useValue: admin },
        { provide: PortfolioPublicationService, useValue: publication },
        RolesGuard,
      ],
    }).overrideGuard(JwtAuthGuard).useClass(FixtureAuthentication).compile();
    app = module.createNestApplication({ logger: false });
    setupApp(app, false, createCorsOptions('http://localhost:3001'), createHttpSecurityConfig({ RATE_LIMIT_API: '1000' }));
    await app.init();
  });
  afterAll(async () => { await app?.close(); });

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
