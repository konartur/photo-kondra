import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PortfolioEntityType, Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import type {
  PortfolioHomeDraftInputDto,
  PortfolioServiceDraftInputDto,
  PortfolioStoryDraftInputDto,
  PortfolioStoryPhotoInputDto,
} from './dto/admin-input.dto.js';
import { CONTACT_LABELS, PORTFOLIO_BRAND } from './dto/shared.dto.js';
import {
  storyPhotoLimitSatisfied,
} from './dto/admin-input.dto.js';
import type {
  AdminPortfolioServiceDto,
  AdminPortfolioServiceListDto,
  AdminPortfolioStoryDto,
  AdminPortfolioStoryListDto,
  AdminPortfolioSettingsDto,
} from './dto/admin-response.dto.js';
import { PORTFOLIO_SETTINGS_ID, PortfolioPersistenceService } from './persistence/portfolio-persistence.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { decodePortfolioAdminCursor, encodePortfolioAdminCursor } from './portfolio-admin-cursor.js';
import type { PortfolioListQueryDto } from './dto/query.dto.js';
import { contactSectionCopy } from './portfolio-contact-copy.js';

const notFound = () => new NotFoundException({ code: 'PORTFOLIO_CONTENT_NOT_FOUND', message: 'Portfolio content not found' });
const conflict = (code = 'PORTFOLIO_CONTENT_REFERENCED') => new ConflictException({ code, message: 'Portfolio content cannot be changed' });

function assertStoryPhotos(coverId: string | null, items: PortfolioStoryPhotoInputDto[]) {
  if (items.length > 10 || new Set(items.map(item => item.id)).size !== items.length
    || new Set(items.map(item => item.image.mediaId)).size !== items.length
    || !storyPhotoLimitSatisfied(coverId, items.map(item => item.image.mediaId)))
    throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Story photos must be unique; cover and photos may reference at most 10 unique media items', errors: [{ field: 'items', code: 'INVALID_PHOTO_SELECTION' }] });
}

function imageColumns(prefix: string, image: { mediaId: string; alt: { uk: string; en: string }; focalPoint: { x: number; y: number } | null } | null) {
  return {
    [`${prefix}MediaId`]: image?.mediaId ?? null,
    [`${prefix}AltUk`]: image?.alt.uk ?? '',
    [`${prefix}AltEn`]: image?.alt.en ?? '',
    [`${prefix}FocalX`]: image?.focalPoint?.x ?? null,
    [`${prefix}FocalY`]: image?.focalPoint?.y ?? null,
  };
}
function seoColumns(seo: PortfolioServiceDraftInputDto['seo']) {
  return {
    seoTitleUk: seo.title.uk, seoTitleEn: seo.title.en,
    seoDescriptionUk: seo.description.uk, seoDescriptionEn: seo.description.en,
    ...imageColumns('share', seo.shareImage),
  };
}
function serviceColumns(data: PortfolioServiceDraftInputDto) {
  return {
    slug: data.slug, titleUk: data.title.uk, titleEn: data.title.en,
    descriptionUk: data.description.uk, descriptionEn: data.description.en,
    amountMinor: data.price?.amountMinor ?? null, currency: data.price?.currency ?? null,
    durationMinutes: data.price?.durationMinutes ?? null, bookingEnabled: data.bookingEnabled,
    ...imageColumns('card', data.cardImage), ...seoColumns(data.seo),
  };
}
function storyColumns(data: PortfolioStoryDraftInputDto) {
  return {
    slug: data.slug, serviceId: data.serviceId, titleUk: data.title.uk, titleEn: data.title.en,
    subtitleUk: data.subtitle.uk, subtitleEn: data.subtitle.en,
    descriptionUk: data.description.uk, descriptionEn: data.description.en,
    ...imageColumns('cover', data.cover), ...seoColumns(data.seo),
  };
}
function photoColumns(photo: PortfolioStoryPhotoInputDto, sortOrder: number) {
  return {
    id: photo.id, mediaId: photo.image.mediaId, altUk: photo.image.alt.uk, altEn: photo.image.alt.en,
    focalX: photo.image.focalPoint?.x ?? null, focalY: photo.image.focalPoint?.y ?? null, sortOrder,
  };
}
function settingsColumns(data: PortfolioHomeDraftInputDto) {
  return {
    brand: PORTFOLIO_BRAND, bookingIntroUk: data.bookingIntro.uk, bookingIntroEn: data.bookingIntro.en,
    servicesTitleUk: data.servicesSection.title.uk, servicesTitleEn: data.servicesSection.title.en,
    servicesDescriptionUk: data.servicesSection.description.uk,
    servicesDescriptionEn: data.servicesSection.description.en,
    storiesTitleUk: data.storiesSection.title.uk, storiesTitleEn: data.storiesSection.title.en,
    contactTitleUk: data.contactSection.title.uk, contactTitleEn: data.contactSection.title.en,
    contactDescriptionUk: data.contactSection.description.uk,
    contactDescriptionEn: data.contactSection.description.en,
    contactButtonLabelUk: data.contactSection.buttonLabel.uk,
    contactButtonLabelEn: data.contactSection.buttonLabel.en,
    ...imageColumns('desktop', data.hero.desktop), ...imageColumns('mobile', data.hero.mobile),
    ...imageColumns('background', data.contactSection.background), ...seoColumns(data.seo),
  };
}
function imageFrom(row: Record<string, unknown>, prefix: string) {
  const mediaId = row[`${prefix}MediaId`] as string | null;
  if (!mediaId) return null;
  const x = row[`${prefix}FocalX`] as number | null;
  const y = row[`${prefix}FocalY`] as number | null;
  return {
    mediaId,
    alt: { uk: row[`${prefix}AltUk`] as string, en: row[`${prefix}AltEn`] as string },
    focalPoint: x === null || y === null ? null : { x, y },
  };
}
function seoFrom(row: Record<string, unknown>) {
  return {
    title: { uk: row.seoTitleUk as string, en: row.seoTitleEn as string },
    description: { uk: row.seoDescriptionUk as string, en: row.seoDescriptionEn as string },
    shareImage: imageFrom(row, 'share'),
  };
}
function base(row: { id: string; status: string; draftVersion: bigint; publishedVersion: bigint | null; publishedAt: Date | null; updatedAt: Date }) {
  return {
    id: row.id, status: row.status as 'DRAFT' | 'PUBLISHED' | 'ARCHIVED',
    draftVersion: Number(row.draftVersion), publishedVersion: row.publishedVersion === null ? null : Number(row.publishedVersion),
    hasUnpublishedChanges: row.publishedVersion === null || row.draftVersion > row.publishedVersion,
    publishedAt: row.publishedAt?.toISOString() ?? null, updatedAt: row.updatedAt.toISOString(),
  };
}
type StoryWithPhotos = Prisma.PortfolioStoryGetPayload<{ include: { photos: true } }>;
type SettingsWithChildren = Prisma.PortfolioSettingsGetPayload<{ include: { contacts: true; services: true; featuredStories: true } }>;
function serviceResponse(row: Prisma.PortfolioServiceGetPayload<object>): AdminPortfolioServiceDto {
  const price = row.amountMinor === null ? null : {
    amountMinor: row.amountMinor,
    currency: row.currency as 'UAH',
    durationMinutes: row.durationMinutes!,
  };
  return { ...base(row), draft: {
    slug: row.slug, title: { uk: row.titleUk, en: row.titleEn }, description: { uk: row.descriptionUk, en: row.descriptionEn },
    price, bookingEnabled: row.bookingEnabled, cardImage: imageFrom(row, 'card'), seo: seoFrom(row),
  } };
}
function storyResponse(row: StoryWithPhotos): AdminPortfolioStoryDto {
  return { ...base(row), draft: {
    slug: row.slug, serviceId: row.serviceId, title: { uk: row.titleUk, en: row.titleEn },
    subtitle: { uk: row.subtitleUk, en: row.subtitleEn }, description: { uk: row.descriptionUk, en: row.descriptionEn },
    cover: imageFrom(row, 'cover'), seo: seoFrom(row),
  }, photos: row.photos.map((photo) => ({ id: photo.id, image: {
    mediaId: photo.mediaId, alt: { uk: photo.altUk, en: photo.altEn },
    focalPoint: photo.focalX === null || photo.focalY === null ? null : { x: photo.focalX, y: photo.focalY },
  } })) };
}
function settingsResponse(row: SettingsWithChildren): AdminPortfolioSettingsDto {
  return { ...base(row), draft: {
    brand: PORTFOLIO_BRAND, bookingIntro: { uk: row.bookingIntroUk, en: row.bookingIntroEn },
    contacts: row.contacts.map(({ type, address, visible }) => ({
      type, address, visible, label: { uk: CONTACT_LABELS[type], en: CONTACT_LABELS[type] },
    })),
    hero: { desktop: imageFrom(row, 'desktop'), mobile: imageFrom(row, 'mobile') },
    servicesSection: { title: { uk: row.servicesTitleUk, en: row.servicesTitleEn }, description: { uk: row.servicesDescriptionUk, en: row.servicesDescriptionEn }, serviceIds: row.services.map((x) => x.serviceId) },
    storiesSection: { title: { uk: row.storiesTitleUk, en: row.storiesTitleEn }, items: row.featuredStories.map((x) => ({ storyId: x.storyId, caption: { uk: x.captionUk, en: x.captionEn }, ...(x.imageMediaId && { image: imageFrom(x, 'image') }) })) },
    contactSection: { ...contactSectionCopy(row), background: imageFrom(row, 'background') },
    seo: seoFrom(row),
  } };
}

@Injectable()
export class PortfolioAdminService {
  constructor(private readonly prisma: PrismaService, private readonly persistence: PortfolioPersistenceService, private readonly config: ConfigService) {}

  async listServices(query: PortfolioListQueryDto): Promise<AdminPortfolioServiceListDto> {
    const secret = this.config.getOrThrow<string>('JWT_ACCESS_SECRET');
    const after = query.cursor ? decodePortfolioAdminCursor(query.cursor, secret, 'services') : null;
    return this.prisma.$transaction(async (tx) => {
      const state = await tx.portfolioContentState.findUniqueOrThrow({ where: { id: 1 } });
      if (after && after.contentVersion !== state.contentVersion.toString()) throw new ConflictException({ code: 'PORTFOLIO_CURSOR_STALE', message: 'Portfolio cursor version changed' });
      const asOf = after?.asOf ?? new Date().toISOString();
      const rows = await tx.portfolioService.findMany({
        where: { createdAt: { lte: new Date(asOf) }, ...(after ? { OR: [{ sortOrder: { gt: after.sortOrder } }, { sortOrder: after.sortOrder, id: { gt: after.id } }] } : {}) },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], take: query.limit + 1,
      });
      const items = rows.slice(0, query.limit);
      const last = items.at(-1);
      return { items: items.map((r) => ({ ...base(r), slug: r.slug, title: { uk: r.titleUk, en: r.titleEn } })), nextCursor: rows.length > query.limit && last ? encodePortfolioAdminCursor({ v: 1, type: 'services', sortOrder: last.sortOrder, id: last.id, asOf, contentVersion: state.contentVersion.toString() }, secret) : null };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  async listStories(query: PortfolioListQueryDto): Promise<AdminPortfolioStoryListDto> {
    const secret = this.config.getOrThrow<string>('JWT_ACCESS_SECRET');
    const after = query.cursor ? decodePortfolioAdminCursor(query.cursor, secret, 'stories') : null;
    return this.prisma.$transaction(async (tx) => {
      const state = await tx.portfolioContentState.findUniqueOrThrow({ where: { id: 1 } });
      if (after && after.contentVersion !== state.contentVersion.toString()) throw new ConflictException({ code: 'PORTFOLIO_CURSOR_STALE', message: 'Portfolio cursor version changed' });
      const asOf = after?.asOf ?? new Date().toISOString();
      const rows = await tx.portfolioStory.findMany({
        where: { createdAt: { lte: new Date(asOf) }, ...(after ? { OR: [{ sortOrder: { gt: after.sortOrder } }, { sortOrder: after.sortOrder, id: { gt: after.id } }] } : {}) },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], take: query.limit + 1,
      });
      const items = rows.slice(0, query.limit);
      const last = items.at(-1);
      return { items: items.map((r) => ({ ...base(r), slug: r.slug, title: { uk: r.titleUk, en: r.titleEn } })), nextCursor: rows.length > query.limit && last ? encodePortfolioAdminCursor({ v: 1, type: 'stories', sortOrder: last.sortOrder, id: last.id, asOf, contentVersion: state.contentVersion.toString() }, secret) : null };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  async createService(ownerId: string, data: PortfolioServiceDraftInputDto, seed?: { id: string; sortOrder: number }) {
    return this.write(async (tx) => {
      await this.validateMedia(tx, ownerId, this.serviceMedia(data));
      const row = await tx.portfolioService.create({ data: { ...serviceColumns(data), ...seed } });
      return serviceResponse(row);
    });
  }
  async getService(id: string) {
    const row = await this.prisma.portfolioService.findUnique({ where: { id } });
    if (!row) throw notFound();
    return serviceResponse(row);
  }
  async updateService(ownerId: string, id: string, expectedVersion: number, data: PortfolioServiceDraftInputDto) {
    return this.write(async (tx) => {
      const current = await tx.portfolioService.findUnique({ where: { id } });
      if (!current) throw notFound();
      if (current.publishedVersion !== null && current.slug !== data.slug) throw conflict('PORTFOLIO_SLUG_IMMUTABLE');
      await this.validateMedia(tx, ownerId, this.serviceMedia(data));
      await this.persistence.claimDraftVersion(tx, PortfolioEntityType.SERVICE, id, expectedVersion);
      return serviceResponse(await tx.portfolioService.update({ where: { id }, data: serviceColumns(data) }));
    });
  }
  async createStory(
    ownerId: string,
    data: PortfolioStoryDraftInputDto,
    seed?: { id: string; sortOrder: number; photos: PortfolioStoryPhotoInputDto[] },
  ) {
    return this.createStoryWithPhotos(ownerId, data, seed?.photos ?? [], seed);
  }
  async createStoryWithPhotos(
    ownerId: string, data: PortfolioStoryDraftInputDto, photos: PortfolioStoryPhotoInputDto[],
    seed?: { id: string; sortOrder: number },
  ) {
    return this.write(async (tx) => {
      if (!(await tx.portfolioService.findUnique({ where: { id: data.serviceId }, select: { id: true } }))) throw notFound();
      const mediaIds = photos.map(photo => photo.image.mediaId);
      assertStoryPhotos(data.cover?.mediaId ?? null, photos);
      await this.validateMedia(tx, ownerId, [...this.storyMedia(data), ...mediaIds]);
      await this.validatePlacementIds(tx, photos);
      return storyResponse(await tx.portfolioStory.create({
        data: {
          ...storyColumns(data),
          ...(seed && { id: seed.id, sortOrder: seed.sortOrder }),
          photos: { create: photos.map(photoColumns) },
        },
        include: { photos: { orderBy: { sortOrder: 'asc' } } },
      }));
    });
  }
  async getStory(id: string) {
    const row = await this.prisma.portfolioStory.findUnique({ where: { id }, include: { photos: { orderBy: { sortOrder: 'asc' } } } });
    if (!row) throw notFound();
    return storyResponse(row);
  }
  async updateStory(ownerId: string, id: string, expectedVersion: number, data: PortfolioStoryDraftInputDto) {
    return this.write(async (tx) => {
      const current = await tx.portfolioStory.findUnique({ where: { id }, include: { photos: true } });
      if (!current) throw notFound();
      if (current.publishedVersion !== null && current.slug !== data.slug) throw conflict('PORTFOLIO_SLUG_IMMUTABLE');
      if (!storyPhotoLimitSatisfied(data.cover?.mediaId ?? null, current.photos.map((photo) => photo.mediaId)))
        throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Story cover and photos may reference at most 10 unique media items' });
      if (!(await tx.portfolioService.findUnique({ where: { id: data.serviceId }, select: { id: true } }))) throw notFound();
      await this.validateMedia(tx, ownerId, this.storyMedia(data));
      await this.persistence.claimDraftVersion(tx, PortfolioEntityType.STORY, id, expectedVersion);
      return storyResponse(await tx.portfolioStory.update({ where: { id }, data: storyColumns(data), include: { photos: { orderBy: { sortOrder: 'asc' } } } }));
    });
  }
  async replacePhotos(ownerId: string, id: string, expectedVersion: number, items: PortfolioStoryPhotoInputDto[]) {
    return this.write(async (tx) => {
      const story = await tx.portfolioStory.findUnique({ where: { id }, include: { photos: true } });
      if (!story) throw notFound();
      if (!storyPhotoLimitSatisfied(story.coverMediaId, items.map((p) => p.image.mediaId)))
        throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Story cover and photos may reference at most 10 unique media items' });
      await this.validateMedia(tx, ownerId, items.map((p) => p.image.mediaId));
      await this.persistence.claimDraftVersion(tx, PortfolioEntityType.STORY, id, expectedVersion);
      await tx.portfolioStoryPhoto.deleteMany({ where: { storyId: id } });
      if (items.length) await tx.portfolioStoryPhoto.createMany({
        data: items.map((photo, sortOrder) => ({ storyId: id, ...photoColumns(photo, sortOrder) })),
      });
      return storyResponse(await tx.portfolioStory.findUniqueOrThrow({ where: { id }, include: { photos: { orderBy: { sortOrder: 'asc' } } } }));
    });
  }
  async saveStoryDraft(ownerId: string, id: string, expectedVersion: number, data: PortfolioStoryDraftInputDto, items: PortfolioStoryPhotoInputDto[]) {
    return this.write(async (tx) => {
      const current = await tx.portfolioStory.findUnique({ where: { id } });
      if (!current) throw notFound();
      await this.persistence.claimDraftVersion(tx, PortfolioEntityType.STORY, id, expectedVersion);
      if (current.publishedVersion !== null && current.slug !== data.slug) throw conflict('PORTFOLIO_SLUG_IMMUTABLE');
      assertStoryPhotos(data.cover?.mediaId ?? null, items);
      if (!(await tx.portfolioService.findUnique({ where: { id: data.serviceId }, select: { id: true } }))) throw notFound();
      await this.validateMedia(tx, ownerId, [...this.storyMedia(data), ...items.map(item => item.image.mediaId)]);
      await this.validatePlacementIds(tx, items, id);
      await tx.portfolioStory.update({ where: { id }, data: storyColumns(data) });
      await tx.portfolioStoryPhoto.deleteMany({ where: { storyId: id } });
      if (items.length) await tx.portfolioStoryPhoto.createMany({ data: items.map((item, index) => ({ storyId: id, ...photoColumns(item, index) })) });
      return storyResponse(await tx.portfolioStory.findUniqueOrThrow({ where: { id }, include: { photos: { orderBy: { sortOrder: 'asc' } } } }));
    });
  }
  async getSettings() {
    const row = await this.prisma.portfolioSettings.findUnique({ where: { id: PORTFOLIO_SETTINGS_ID }, include: { contacts: { orderBy: { sortOrder: 'asc' } }, services: { orderBy: { sortOrder: 'asc' } }, featuredStories: { orderBy: { sortOrder: 'asc' } } } });
    if (!row) throw new NotFoundException({ code: 'PORTFOLIO_CONTENT_NOT_FOUND', message: 'Portfolio settings are not initialized' });
    return settingsResponse(row);
  }
  async updateSettings(ownerId: string, expectedVersion: number, data: PortfolioHomeDraftInputDto) {
    return this.write(async (tx) => {
      const [services, stories] = await Promise.all([
        tx.portfolioService.findMany({ where: { id: { in: data.servicesSection.serviceIds } }, select: { id: true } }),
        tx.portfolioStory.findMany({ where: { id: { in: data.storiesSection.items.map((i) => i.storyId) } }, select: { id: true } }),
      ]);
      if (services.length !== data.servicesSection.serviceIds.length || stories.length !== data.storiesSection.items.length) throw notFound();
      await this.validateMedia(tx, ownerId, this.homeMedia(data));
      const id = PORTFOLIO_SETTINGS_ID;
      await this.persistence.claimDraftVersion(tx, PortfolioEntityType.SETTINGS, id, expectedVersion);
      const update = settingsColumns(data);
      await tx.portfolioSettings.update({ where: { id }, data: update });
      await tx.portfolioContact.deleteMany({ where: { settingsId: id } });
      await tx.portfolioHomeService.deleteMany({ where: { settingsId: id } });
      await tx.portfolioFeaturedStory.deleteMany({ where: { settingsId: id } });
      if (data.contacts.length) await tx.portfolioContact.createMany({
        data: data.contacts.map(({ type, address, visible }, sortOrder) => ({
          settingsId: id, type, address, visible, sortOrder,
          labelUk: CONTACT_LABELS[type], labelEn: CONTACT_LABELS[type],
        })),
      });
      if (data.servicesSection.serviceIds.length) await tx.portfolioHomeService.createMany({ data: data.servicesSection.serviceIds.map((serviceId, sortOrder) => ({ settingsId: id, serviceId, sortOrder })) });
      if (data.storiesSection.items.length) await tx.portfolioFeaturedStory.createMany({ data: data.storiesSection.items.map((item, sortOrder) => ({ settingsId: id, storyId: item.storyId, captionUk: item.caption.uk, captionEn: item.caption.en, ...imageColumns('image', item.image ?? null), sortOrder })) });
      return settingsResponse(await tx.portfolioSettings.findUniqueOrThrow({ where: { id }, include: { contacts: { orderBy: { sortOrder: 'asc' } }, services: { orderBy: { sortOrder: 'asc' } }, featuredStories: { orderBy: { sortOrder: 'asc' } } } }));
    });
  }
  async removeService(id: string, expectedVersion: number) {
    await this.write(async (tx) => {
      const row = await tx.portfolioService.findUnique({ where: { id }, include: { _count: { select: { stories: true, homePlacements: true, publishedReferences: true } } } });
      if (!row) throw notFound();
      if (row.draftVersion !== BigInt(expectedVersion)) throw conflict('PORTFOLIO_VERSION_CONFLICT');
      if (row.publishedVersion !== null || row._count.stories || row._count.homePlacements || row._count.publishedReferences) throw conflict();
      await tx.portfolioService.delete({ where: { id } });
    });
  }
  async removeStory(id: string, expectedVersion: number) {
    await this.write(async (tx) => {
      const row = await tx.portfolioStory.findUnique({ where: { id }, include: { _count: { select: { featuredPlacements: true, publishedReferences: true } } } });
      if (!row) throw notFound();
      if (row.draftVersion !== BigInt(expectedVersion)) throw conflict('PORTFOLIO_VERSION_CONFLICT');
      if (row.publishedVersion !== null || row._count.featuredPlacements || row._count.publishedReferences) throw conflict();
      await tx.portfolioStory.delete({ where: { id } });
    });
  }
  private serviceMedia(data: PortfolioServiceDraftInputDto) { return [data.cardImage?.mediaId, data.seo.shareImage?.mediaId].filter((id): id is string => !!id); }
  private storyMedia(data: PortfolioStoryDraftInputDto) { return [data.cover?.mediaId, data.seo.shareImage?.mediaId].filter((id): id is string => !!id); }
  private homeMedia(data: PortfolioHomeDraftInputDto) { return [data.hero.desktop?.mediaId, data.hero.mobile?.mediaId, data.contactSection.background?.mediaId, data.seo.shareImage?.mediaId, ...data.storiesSection.items.map(item => item.image?.mediaId)].filter((id): id is string => !!id); }
  private async write<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    try {
      return await this.persistence.withContentLock(operation);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ConflictException({ code: 'PORTFOLIO_SLUG_TAKEN', message: 'Portfolio slug is already in use' });
      throw error;
    }
  }
  private async validateMedia(tx: Prisma.TransactionClient, ownerId: string, ids: string[]) {
    if (!ids.length) return;
    const rows = await tx.portfolioMedia.findMany({ where: { id: { in: [...new Set(ids)] }, uploadedById: ownerId, status: { not: 'DELETED' } }, select: { id: true } });
    if (rows.length !== new Set(ids).size) throw notFound();
  }
  private async validatePlacementIds(tx: Prisma.TransactionClient, items: PortfolioStoryPhotoInputDto[], storyId?: string) {
    if (!items.length) return;
    const occupied = await tx.portfolioStoryPhoto.findFirst({
      where: { id: { in: items.map(item => item.id) }, ...(storyId ? { storyId: { not: storyId } } : {}) },
      select: { id: true },
    });
    if (occupied) throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Photo placement IDs are already in use', errors: [{ field: 'items', code: 'PLACEMENT_ID_TAKEN' }] });
  }
}
