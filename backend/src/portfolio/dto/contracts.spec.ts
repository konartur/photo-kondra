import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { Module, ValidationPipe, type INestApplication, type Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger';
import { portfolioModels } from '../portfolio-openapi.js';
import {
  PortfolioHomeDraftInputDto,
  PortfolioServiceDraftInputDto,
  PortfolioStoryDraftInputDto,
  PortfolioServiceDraftUpdateDto,
  PortfolioImageRefDto,
  RequestPortfolioUploadDto,
  ReplaceStoryPhotosDto,
  PortfolioContactInputDto,
  storyPhotoLimitSatisfied,
} from './admin-input.dto.js';
import { PortfolioLocaleQueryDto, PortfolioPublicListQueryDto } from './query.dto.js';
import {
  fixtureId,
  homeDraftFixture,
  publicFixtures,
  serviceDraftFixture,
  storyDraftFixture,
} from '../../../test/portfolio-contract.fixtures.js';

const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
function input(model: Type<object>, value: unknown) {
  return pipe.transform(value, { type: 'body', metatype: model });
}
const imageRef = { mediaId: fixtureId, alt: { uk: '', en: '' }, focalPoint: null };
const photoItems = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    id: `12345678-1234-4234-8234-${String(index).padStart(12, '0')}`,
    image: { ...imageRef, mediaId: `12345678-1234-4234-8234-${String(index).padStart(12, '0')}` },
  }));

describe('Portfolio input contracts through the global validation policy', () => {
  it.each([
    [PortfolioServiceDraftInputDto, serviceDraftFixture],
    [PortfolioStoryDraftInputDto, storyDraftFixture],
    [PortfolioHomeDraftInputDto, homeDraftFixture],
  ] as const)('accepts and trims bilingual draft %p', async (model, fixture) => {
    const result = await input(model, fixture);
    expect(result).toBeInstanceOf(model);
    expect(JSON.stringify(result)).not.toContain(' Текст ');
    expect(JSON.stringify(result)).toContain('Text');
  });

  it('allows incomplete editorial draft translations, requiring both keys', async () => {
    await expect(
      input(PortfolioServiceDraftInputDto, { ...serviceDraftFixture, title: { uk: '', en: '' } }),
    ).resolves.toBeDefined();
  });
  it.each([
    null,
    [],
    'text',
    { uk: 'Назва' },
    { uk: 'Назва', en: null },
    { uk: 1, en: 'Title' },
    { uk: '', en: '', de: '' },
  ])('rejects invalid translation structure %p', async (title) => {
    await expect(
      input(PortfolioServiceDraftInputDto, { ...serviceDraftFixture, title }),
    ).rejects.toThrow();
  });
  it.each(['url', 'storageKey', 'status', 'ownerId', 'publishedAt', 'id', 'contentVersion'])(
    'rejects writable %s',
    async (field) => {
      await expect(
        input(PortfolioServiceDraftInputDto, { ...serviceDraftFixture, [field]: 'untrusted' }),
      ).rejects.toThrow();
    },
  );
  it('rejects nested URLs and unknown focal point fields', async () => {
    await expect(
      input(PortfolioImageRefDto, { ...imageRef, url: 'https://example.invalid' }),
    ).rejects.toThrow();
    await expect(
      input(PortfolioImageRefDto, { ...imageRef, focalPoint: { x: 0.5, y: 0.5, key: 'hidden' } }),
    ).rejects.toThrow();
  });
  it.each([
    undefined,
    [],
    {},
    { amountMinor: 0.1, currency: 'UAH', durationMinutes: 60 },
    { amountMinor: -1, currency: 'UAH', durationMinutes: 60 },
    { amountMinor: 100_000_001, currency: 'UAH', durationMinutes: 60 },
    { amountMinor: 100, currency: 'USD', durationMinutes: 60 },
    { amountMinor: 100, currency: 'UAH', durationMinutes: 1441 },
  ])('rejects invalid price %p', async (price) => {
    await expect(
      input(PortfolioServiceDraftInputDto, { ...serviceDraftFixture, price }),
    ).rejects.toThrow();
  });
  it('accepts explicit price null and integer price boundaries', async () => {
    await expect(input(PortfolioServiceDraftInputDto, serviceDraftFixture)).resolves.toBeDefined();
    for (const amountMinor of [0, 100_000_000]) {
      await expect(
        input(PortfolioServiceDraftInputDto, {
          ...serviceDraftFixture,
          price: { amountMinor, currency: 'UAH', durationMinutes: 1440 },
        }),
      ).resolves.toBeDefined();
    }
  });
  it.each([undefined, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '1', null])(
    'rejects invalid expectedVersion %p',
    async (expectedVersion) => {
      await expect(
        input(PortfolioServiceDraftUpdateDto, { expectedVersion, data: serviceDraftFixture }),
      ).rejects.toThrow();
    },
  );
  it('accepts versioned replacement with a concrete draft', async () => {
    await expect(
      input(PortfolioServiceDraftUpdateDto, { expectedVersion: 1, data: serviceDraftFixture }),
    ).resolves.toBeDefined();
  });
  it.each([NaN, Infinity, -0.1, 1.01, '0.5'])('rejects invalid focal coordinates %p', async (x) => {
    await expect(
      input(PortfolioImageRefDto, { ...imageRef, focalPoint: { x, y: 0.5 } }),
    ).rejects.toThrow();
  });
  it('enforces contextual localized string limits', async () => {
    await expect(
      input(PortfolioServiceDraftInputDto, {
        ...serviceDraftFixture,
        title: { uk: 'a'.repeat(121), en: '' },
      }),
    ).rejects.toThrow();
    await expect(
      input(PortfolioStoryDraftInputDto, {
        ...storyDraftFixture,
        subtitle: { uk: '', en: 'a'.repeat(201) },
      }),
    ).rejects.toThrow();
    await expect(
      input(PortfolioImageRefDto, { ...imageRef, alt: { uk: '', en: 'a'.repeat(501) } }),
    ).rejects.toThrow();
    await expect(
      input(PortfolioServiceDraftInputDto, {
        ...serviceDraftFixture,
        seo: { ...serviceDraftFixture.seo, description: { uk: '', en: 'a'.repeat(321) } },
      }),
    ).rejects.toThrow();
  });
  it('accepts exactly 10 photos, rejects 11 and duplicate placement/media IDs', async () => {
    await expect(
      input(ReplaceStoryPhotosDto, { expectedVersion: 1, items: photoItems(10) }),
    ).resolves.toBeDefined();
    await expect(
      input(ReplaceStoryPhotosDto, { expectedVersion: 1, items: photoItems(11) }),
    ).rejects.toThrow();
    await expect(
      input(ReplaceStoryPhotosDto, {
        expectedVersion: 1,
        items: [photoItems(1)[0], photoItems(1)[0]],
      }),
    ).rejects.toThrow();
    const items = photoItems(2);
    items[1].image.mediaId = items[0].image.mediaId;
    await expect(input(ReplaceStoryPhotosDto, { expectedVersion: 1, items })).rejects.toThrow();
  });
  it('counts the cover once in the story-wide union, including a separate 11th cover', () => {
    const ids = photoItems(10).map((item) => item.image.mediaId);
    expect(storyPhotoLimitSatisfied(ids[0], ids)).toBe(true);
    expect(storyPhotoLimitSatisfied(fixtureId, ids)).toBe(false);
    expect(storyPhotoLimitSatisfied(fixtureId, ids.slice(0, 9))).toBe(true);
  });
  it('enforces upload bytes independently from gallery limits and rejects unsafe filenames/MIME', async () => {
    const file = { filename: ' photo.jpg ', mimeType: 'image/jpeg', sizeBytes: 20_000_000 };
    await expect(input(RequestPortfolioUploadDto, file)).resolves.toMatchObject({
      filename: 'photo.jpg',
    });
    for (const sizeBytes of [0, -1, 20_000_001, 1.5, Number.MAX_SAFE_INTEGER + 1, '10'])
      await expect(input(RequestPortfolioUploadDto, { ...file, sizeBytes })).rejects.toThrow();
    for (const filename of ['', '../x.jpg', 'a\\x.jpg', 'a\u0000.jpg'])
      await expect(input(RequestPortfolioUploadDto, { ...file, filename })).rejects.toThrow();
    await expect(
      input(RequestPortfolioUploadDto, { ...file, mimeType: 'image/gif' }),
    ).rejects.toThrow();
  });
  it('rejects oversized and duplicate home selections/contact types', async () => {
    await expect(
      input(PortfolioHomeDraftInputDto, {
        ...homeDraftFixture,
        servicesSection: {
          ...homeDraftFixture.servicesSection,
          serviceIds: Array(21).fill(fixtureId),
        },
      }),
    ).rejects.toThrow();
    await expect(
      input(PortfolioHomeDraftInputDto, {
        ...homeDraftFixture,
        storiesSection: {
          title: { uk: '', en: '' },
          items: Array(13).fill({ storyId: fixtureId, caption: { uk: '', en: '' } }),
        },
      }),
    ).rejects.toThrow();
    const contact = {
      type: 'email',
      label: { uk: '', en: '' },
      address: 'test@example.invalid',
      visible: true,
    };
    await expect(
      input(PortfolioHomeDraftInputDto, { ...homeDraftFixture, contacts: [contact, contact] }),
    ).rejects.toThrow();
  });
  it.each([
    'http://t.me/test',
    'https://t.me.evil.invalid/test',
    'https://user:pass@t.me/test',
    'https://t.me/test?text=secret',
    'javascript:alert(1)',
  ])('rejects unsafe contact address %s', async (address) => {
    await expect(
      input(PortfolioContactInputDto, {
        type: 'telegram',
        label: { uk: '', en: '' },
        address,
        visible: true,
      }),
    ).rejects.toThrow();
  });
  it.each([
    { type: 'telegram', address: 'https://t.me/photographer' },
    { type: 'instagram', address: 'https://www.instagram.com/photographer/' },
    { type: 'email', address: 'test@example.invalid' },
  ])('accepts channel-specific contact %p', async (contact) => {
    await expect(
      input(PortfolioContactInputDto, { ...contact, visible: true }),
    ).resolves.toBeDefined();
  });
  it('still accepts the stored label from an older contact snapshot', async () => {
    await expect(input(PortfolioContactInputDto, {
      type: 'email', label: { uk: 'Написати', en: 'Email me' },
      address: 'test@example.invalid', visible: true,
    })).resolves.toBeDefined();
  });
  it('defaults missing locale to en, accepts uk and rejects unsupported/null locale and bad pagination', async () => {
    await expect(input(PortfolioLocaleQueryDto, {})).resolves.toMatchObject({ locale: 'en' });
    await expect(
      input(PortfolioPublicListQueryDto, { locale: 'uk', limit: '50' }),
    ).resolves.toMatchObject({ locale: 'uk', limit: 50 });
    for (const locale of ['ua', 'de', null, ['uk']])
      await expect(input(PortfolioLocaleQueryDto, { locale })).rejects.toThrow();
    for (const limit of ['0', '51', '1.5'])
      await expect(input(PortfolioPublicListQueryDto, { limit })).rejects.toThrow();
    await expect(input(PortfolioPublicListQueryDto, { cursor: null })).rejects.toThrow();
  });
});

@Module({})
class ContractTestModule {}
describe('Portfolio OpenAPI contract schemas', () => {
  let app: INestApplication;
  let schemas: Record<string, SchemaObject>;
  beforeAll(async () => {
    app = await NestFactory.create(ContractTestModule, { logger: false });
    const document = SwaggerModule.createDocument(app, new DocumentBuilder().build(), {
      extraModels: portfolioModels,
    });
    schemas = document.components!.schemas as Record<string, SchemaObject>;
  });
  afterAll(async () => {
    await app?.close();
  });

  it('registers nonempty concrete models for all public/admin/media/query wrappers', () => {
    for (const model of portfolioModels) {
      expect(schemas[model.name]?.properties).toBeDefined();
      expect(Object.keys(schemas[model.name].properties!)).not.toHaveLength(0);
    }
    expect(schemas.PortfolioHomePageDto.properties!.page).toEqual({
      $ref: '#/components/schemas/PortfolioHomeDto',
    });
    expect(schemas.AdminPortfolioMediaListDto.properties!.items).toMatchObject({
      type: 'array',
      items: { $ref: '#/components/schemas/AdminPortfolioMediaDto' },
    });
    expect(schemas.PortfolioLocaleQueryDto.properties!.locale).toMatchObject({
      enum: ['uk', 'en'],
      default: 'en',
    });
    expect(schemas.LocalizedTitleDto.properties!.uk).toMatchObject({
      type: 'string',
      maxLength: 120,
    });
  });
  it('documents required nullable fields, money, photo/upload limits and optional error details', () => {
    expect(schemas.PortfolioServiceDraftInputDto.required).toContain('price');
    expect(schemas.PortfolioServiceDraftInputDto.properties!.price).toMatchObject({
      nullable: true,
    });
    expect(schemas.PortfolioPriceDto.properties!.amountMinor).toMatchObject({
      type: 'integer',
      minimum: 0,
      maximum: 100_000_000,
    });
    expect(schemas.ReplaceStoryPhotosDto.properties!.items).toMatchObject({ maxItems: 10 });
    expect(schemas.PortfolioStoryDto.properties!.photos).toMatchObject({ maxItems: 10 });
    expect(schemas.PortfolioStoryDto.properties).not.toHaveProperty('nextCursor');
    expect(schemas.RequestPortfolioUploadDto.properties!.sizeBytes).toMatchObject({
      maximum: 20_000_000,
    });
    expect(schemas.PortfolioApiErrorDto.required).toEqual(['statusCode', 'code', 'message']);
  });
  it.each(['uk', 'en'] as const)(
    'provides locale-selected typed site/home/service/story fixtures for %s',
    (locale) => {
      const { site, home, service, story } = publicFixtures(locale);
      expect(site.locale).toBe(locale);
      expect(home.seo.canonicalPath).toBe(`/${locale}`);
      expect(service.title).toBe(locale === 'uk' ? 'Портрет' : 'Portrait');
      expect(story.photos).toHaveLength(1);
      for (const publicValue of [site, home, service, story]) {
        expect(JSON.stringify(publicValue)).not.toMatch(
          /storageKey|originalKey|draft|uploadUrl|processingLock/,
        );
      }
    },
  );
});
