import { ConflictException, Injectable, NotFoundException, Optional, ServiceUnavailableException } from '@nestjs/common';
import { PortfolioCacheInvalidationService } from './portfolio-cache-invalidation.service.js';
import { PortfolioEntityType, Prisma } from '@prisma/client';
import type {
  PortfolioHomeDraftInputDto,
  PortfolioServiceDraftInputDto,
  PortfolioStoryDraftInputDto,
  PortfolioStoryPhotoInputDto,
} from './dto/admin-input.dto.js';
import { PORTFOLIO_SETTINGS_ID, PortfolioPersistenceService } from './persistence/portfolio-persistence.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { portfolioMediaFields, portfolioReadinessErrors, type PortfolioReadinessError } from './portfolio-readiness.js';
import { parsePortfolioSnapshot } from './persistence/portfolio-snapshot.js';
import type { PortfolioPublicationResponseDto } from './dto/admin-response.dto.js';
import type { PortfolioLocaleQueryDto } from './dto/query.dto.js';
import { CONTACT_LABELS, PORTFOLIO_BRAND, type Locale } from './dto/shared.dto.js';
import { contactSectionCopy } from './portfolio-contact-copy.js';

const notFound = () => new NotFoundException({ code: 'PORTFOLIO_CONTENT_NOT_FOUND', message: 'Portfolio content not found' });
const conflict = (code: string, message: string) => new ConflictException({ code, message });
const incomplete = (errors: PortfolioReadinessError[] = []) => new ConflictException({ code: 'PORTFOLIO_NOT_READY', message: 'Portfolio draft is incomplete or has unavailable dependencies', errors: errors.slice(0, 50) });
const localized = (value: { uk: string; en: string }) => Boolean(value.uk.trim() && value.en.trim());

function image(row: Record<string, unknown>, prefix: string) {
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
function seo(row: Record<string, unknown>) {
  return {
    title: { uk: row.seoTitleUk as string, en: row.seoTitleEn as string },
    description: { uk: row.seoDescriptionUk as string, en: row.seoDescriptionEn as string },
    shareImage: image(row, 'share'),
  };
}
function serviceDraft(row: Prisma.PortfolioServiceGetPayload<object>): PortfolioServiceDraftInputDto {
  return {
    slug: row.slug, title: { uk: row.titleUk, en: row.titleEn },
    description: { uk: row.descriptionUk, en: row.descriptionEn },
    price: row.amountMinor === null ? null : { amountMinor: row.amountMinor, currency: 'UAH', durationMinutes: row.durationMinutes! },
    bookingEnabled: row.bookingEnabled, cardImage: image(row, 'card'), seo: seo(row),
  };
}
type StoryWithPhotos = Prisma.PortfolioStoryGetPayload<{ include: { photos: { orderBy: { sortOrder: 'asc' } } } }>;
function storyDraft(row: StoryWithPhotos) {
  const data: PortfolioStoryDraftInputDto = {
    slug: row.slug, title: { uk: row.titleUk, en: row.titleEn }, subtitle: { uk: row.subtitleUk, en: row.subtitleEn },
    description: { uk: row.descriptionUk, en: row.descriptionEn }, serviceId: row.serviceId,
    cover: image(row, 'cover'), seo: seo(row),
  };
  const photos: PortfolioStoryPhotoInputDto[] = row.photos.map((photo) => ({ id: photo.id, image: {
    mediaId: photo.mediaId, alt: { uk: photo.altUk, en: photo.altEn },
    focalPoint: photo.focalX === null || photo.focalY === null ? null : { x: photo.focalX, y: photo.focalY },
  } }));
  return { data, photos };
}
type SettingsWithRelations = Prisma.PortfolioSettingsGetPayload<{ include: { contacts: { orderBy: { sortOrder: 'asc' } }; services: { orderBy: { sortOrder: 'asc' } }; featuredStories: { orderBy: { sortOrder: 'asc' } } } }>;
function settingsDraft(row: SettingsWithRelations): PortfolioHomeDraftInputDto {
  return {
    brand: PORTFOLIO_BRAND,
    contacts: row.contacts.map(({ type, address, visible }) => ({ type, address, visible })),
    bookingIntro: { uk: row.bookingIntroUk, en: row.bookingIntroEn },
    hero: { desktop: image(row, 'desktop'), mobile: image(row, 'mobile') },
    servicesSection: { title: { uk: row.servicesTitleUk, en: row.servicesTitleEn }, description: { uk: row.servicesDescriptionUk, en: row.servicesDescriptionEn }, serviceIds: row.services.map((item) => item.serviceId) },
    storiesSection: { title: { uk: row.storiesTitleUk, en: row.storiesTitleEn }, items: row.featuredStories.map((item) => ({ storyId: item.storyId, caption: { uk: item.captionUk, en: item.captionEn }, ...(item.imageMediaId && { image: image(item, 'image') }) })) },
    contactSection: { ...contactSectionCopy(row), background: image(row, 'background') },
    seo: seo(row),
  };
}
function textSet(...values: Array<{ uk: string; en: string }>) { return values.every(localized); }
function imageComplete(value: { alt: { uk: string; en: string } } | null) { return Boolean(value && textSet(value.alt)); }
function seoComplete(value: PortfolioServiceDraftInputDto['seo']) { return textSet(value.title, value.description) && (!value.shareImage || imageComplete(value.shareImage)); }
function serviceComplete(data: PortfolioServiceDraftInputDto) {
  return portfolioReadinessErrors(data).length === 0;
}
function storyComplete(data: PortfolioStoryDraftInputDto, photos: PortfolioStoryPhotoInputDto[]) {
  return portfolioReadinessErrors(data, photos).length === 0;
}
function settingsComplete(data: PortfolioHomeDraftInputDto) {
  return portfolioReadinessErrors(data).length === 0;
}
function response(id: string, status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED', draftVersion: bigint, publishedVersion: bigint | null, contentVersion: bigint, publishedAt: Date | null): PortfolioPublicationResponseDto {
  return { id, status, draftVersion: Number(draftVersion), publishedVersion: publishedVersion === null ? null : Number(publishedVersion), contentVersion: Number(contentVersion), publishedAt: publishedAt?.toISOString() ?? null };
}
const settingsInclude = { contacts: { orderBy: { sortOrder: 'asc' } }, services: { orderBy: { sortOrder: 'asc' } }, featuredStories: { orderBy: { sortOrder: 'asc' } } } as const;
const storyInclude = { photos: { orderBy: { sortOrder: 'asc' } } } as const;

@Injectable()
export class PortfolioPublicationService {
  constructor(private readonly prisma: PrismaService, private readonly persistence: PortfolioPersistenceService, @Optional() private readonly invalidation?: PortfolioCacheInvalidationService) {}

  async publish(type: PortfolioEntityType, id: string, expectedVersion: number): Promise<PortfolioPublicationResponseDto> {
    const result = await this.persistence.withContentLock(async (tx) => {
      const current = await this.current(tx, type, id);
      if (!current) throw notFound();
      if (current.draftVersion !== BigInt(expectedVersion)) throw conflict('PORTFOLIO_VERSION_CONFLICT', 'Draft version changed');
      if (current.status === 'PUBLISHED' && current.publishedVersion === current.draftVersion) {
        const active = await tx.portfolioPublishedDocument.findUnique({ where: { entityType_entityId: { entityType: type, entityId: id } }, select: { id: true } });
        if (!active) throw new ServiceUnavailableException('Published portfolio snapshot is unavailable');
        const state = await tx.portfolioContentState.findUniqueOrThrow({ where: { id: 1 } });
        return response(id, 'PUBLISHED', current.draftVersion, current.publishedVersion, state.contentVersion, current.publishedAt);
      }
      const snapshot = await this.prepareSnapshot(tx, type, id);
      await this.persistence.writeSnapshot(tx, id, expectedVersion, snapshot);
      const now = new Date();
      if (type === PortfolioEntityType.SERVICE) await tx.portfolioService.update({ where: { id }, data: { status: 'PUBLISHED', publishedVersion: BigInt(expectedVersion), publishedAt: now } });
      else if (type === PortfolioEntityType.STORY) await tx.portfolioStory.update({ where: { id }, data: { status: 'PUBLISHED', publishedVersion: BigInt(expectedVersion), publishedAt: now } });
      else await tx.portfolioSettings.update({ where: { id }, data: { status: 'PUBLISHED', publishedVersion: BigInt(expectedVersion), publishedAt: now } });
      const contentVersion = await this.persistence.advanceContentVersion(tx);
      return response(id, 'PUBLISHED', current.draftVersion, BigInt(expectedVersion), contentVersion, now);
    });
    this.invalidation?.kick();
    return result;
  }

  async archive(type: PortfolioEntityType, id: string, expectedVersion: number): Promise<PortfolioPublicationResponseDto> {
    const result = await this.persistence.withContentLock(async (tx) => {
      const current = await this.current(tx, type, id);
      if (!current) throw notFound();
      if (current.draftVersion !== BigInt(expectedVersion)) throw conflict('PORTFOLIO_VERSION_CONFLICT', 'Draft version changed');
      if (current.status === 'ARCHIVED') {
        const state = await tx.portfolioContentState.findUniqueOrThrow({ where: { id: 1 } });
        return response(id, 'ARCHIVED', current.draftVersion, current.publishedVersion, state.contentVersion, current.publishedAt);
      }
      const dependents = await this.dependentPublishedReferences(tx, type, id);
      if (dependents) throw conflict('PORTFOLIO_CONTENT_REFERENCED', 'Published content still references this item');
      const active = await tx.portfolioPublishedDocument.findUnique({ where: { entityType_entityId: { entityType: type, entityId: id } }, select: { id: true } });
      if (current.status === 'PUBLISHED' && !active)
        throw new ServiceUnavailableException('Published portfolio snapshot is unavailable');
      if (active) await tx.portfolioPublishedDocument.delete({ where: { entityType_entityId: { entityType: type, entityId: id } } });
      if (type === PortfolioEntityType.SERVICE) await tx.portfolioService.update({ where: { id }, data: { status: 'ARCHIVED' } });
      else if (type === PortfolioEntityType.STORY) await tx.portfolioStory.update({ where: { id }, data: { status: 'ARCHIVED' } });
      else await tx.portfolioSettings.update({ where: { id }, data: { status: 'ARCHIVED' } });
      const contentVersion = active ? await this.persistence.advanceContentVersion(tx) : (await tx.portfolioContentState.findUniqueOrThrow({ where: { id: 1 } })).contentVersion;
      return response(id, 'ARCHIVED', current.draftVersion, current.publishedVersion, contentVersion, current.publishedAt);
    });
    this.invalidation?.kick();
    return result;
  }

  async preview(type: PortfolioEntityType, id: string, query: PortfolioLocaleQueryDto) {
    const draft = await this.readDraft(type, id);
    if (!draft) throw notFound();
    const errors = portfolioReadinessErrors(draft.data as PortfolioServiceDraftInputDto | PortfolioStoryDraftInputDto | PortfolioHomeDraftInputDto, draft.photos);
    if (errors.length) throw incomplete(errors);
    const fields = portfolioMediaFields(draft.data as PortfolioServiceDraftInputDto | PortfolioStoryDraftInputDto | PortfolioHomeDraftInputDto, draft.photos);
    if (fields.length) {
      const ready = await this.prisma.portfolioMedia.findMany({ where: { id: { in: [...new Set(fields.map(field => field.mediaId))] }, status: 'READY', variants: { some: {} } }, select: { id: true } });
      const readyIds = new Set(ready.map(media => media.id));
      const unavailable = fields.filter(field => !readyIds.has(field.mediaId)).map(({ field }) => ({ field, code: 'MEDIA_NOT_READY' }));
      if (unavailable.length) throw incomplete(unavailable);
    }
    const settings = await this.prisma.portfolioSettings.findUnique({ where: { id: PORTFOLIO_SETTINGS_ID }, include: settingsInclude });
    if (!settings) throw notFound();
    const locale = query.locale;
    const site = await this.previewSite(settingsDraft(settings), settings, locale);
    const page = type === PortfolioEntityType.SETTINGS
      ? await this.previewHome(draft.data as PortfolioHomeDraftInputDto, locale)
      : type === PortfolioEntityType.SERVICE
        ? await this.previewService(id, draft.data as PortfolioServiceDraftInputDto, locale)
        : await this.previewStory(id, draft.data as PortfolioStoryDraftInputDto, draft.photos ?? [], locale);
    return { draftVersion: draft.draftVersion, site, page };
  }

  private async current(tx: Prisma.TransactionClient, type: PortfolioEntityType, id: string) {
    if (type === PortfolioEntityType.SERVICE) return tx.portfolioService.findUnique({ where: { id } });
    if (type === PortfolioEntityType.STORY) return tx.portfolioStory.findUnique({ where: { id } });
    return tx.portfolioSettings.findUnique({ where: { id } });
  }
  private async prepareSnapshot(tx: Prisma.TransactionClient, type: PortfolioEntityType, id: string) {
    let data: PortfolioServiceDraftInputDto | PortfolioStoryDraftInputDto | PortfolioHomeDraftInputDto;
    let photos: PortfolioStoryPhotoInputDto[] = [];
    const errors: PortfolioReadinessError[] = [];
    if (type === PortfolioEntityType.SERVICE) {
      const row = await tx.portfolioService.findUnique({ where: { id } });
      if (!row) throw notFound();
      data = serviceDraft(row);
      errors.push(...portfolioReadinessErrors(data));
    } else if (type === PortfolioEntityType.STORY) {
      const row = await tx.portfolioStory.findUnique({ where: { id }, include: storyInclude });
      if (!row) throw notFound();
      const result = storyDraft(row);
      data = result.data; photos = result.photos;
      errors.push(...portfolioReadinessErrors(data, photos));
      const service = await tx.portfolioService.findUnique({ where: { id: data.serviceId }, select: { status: true } });
      if (service?.status !== 'PUBLISHED')
        errors.push({ field: 'serviceId', code: 'DEPENDENCY_NOT_PUBLISHED' });
    } else {
      const row = await tx.portfolioSettings.findUnique({ where: { id }, include: settingsInclude });
      if (!row) throw notFound();
      data = settingsDraft(row);
      errors.push(...portfolioReadinessErrors(data));
      const [services, stories] = await Promise.all([
        tx.portfolioService.findMany({ where: { id: { in: data.servicesSection.serviceIds }, status: 'PUBLISHED' }, select: { id: true } }),
        tx.portfolioStory.findMany({ where: { id: { in: data.storiesSection.items.map((item) => item.storyId) }, status: 'PUBLISHED' }, include: { publishedDocument: true } }),
      ]);
      const serviceIds = new Set(services.map(service => service.id));
      const storyIds = new Set(stories.map(story => story.id));
      data.servicesSection.serviceIds.forEach((serviceId, index) => {
        if (!serviceIds.has(serviceId)) errors.push({ field: `servicesSection.serviceIds.${index}`, code: 'DEPENDENCY_NOT_PUBLISHED' });
      });
      data.storiesSection.items.forEach((item, index) => {
        if (!storyIds.has(item.storyId)) errors.push({ field: `storiesSection.items.${index}.storyId`, code: 'DEPENDENCY_NOT_PUBLISHED' });
      });
      data.storiesSection.items = await Promise.all(data.storiesSection.items.map(async placement => {
        const row = stories.find(story => story.id === placement.storyId);
        if (!row?.publishedDocument) return placement;
        const snapshot = await parsePortfolioSnapshot(row.publishedDocument.snapshot);
        if (snapshot.entityType !== 'STORY') throw new ServiceUnavailableException('Published story snapshot unavailable');
        return { ...placement, caption: placement.caption.uk.trim() || placement.caption.en.trim() ? placement.caption : snapshot.data.description, image: placement.image ?? snapshot.data.cover };
      }));
    }
    const mediaFields = portfolioMediaFields(data, photos);
    const mediaIds = [...new Set(mediaFields.map(field => field.mediaId))];
    if (mediaIds.length) {
      const ready = await tx.portfolioMedia.findMany({ where: { id: { in: mediaIds }, status: 'READY', variants: { some: {} } }, select: { id: true } });
      const readyIds = new Set(ready.map(media => media.id));
      errors.push(...mediaFields.filter(field => !readyIds.has(field.mediaId)).map(({ field }) => ({ field, code: 'MEDIA_NOT_READY' })));
    }
    if (errors.length) {
      if (errors.every(error => error.field === 'serviceId' && error.code === 'DEPENDENCY_NOT_PUBLISHED'))
        throw new ConflictException({ code: 'PORTFOLIO_STORY_SERVICE_UNPUBLISHED', message: 'Publish the linked service before publishing this story', errors });
      throw incomplete(errors);
    }
    const snapshot = type === PortfolioEntityType.STORY
      ? { schemaVersion: 1, entityType: type, data, photos }
      : { schemaVersion: 1, entityType: type, data };
    return snapshot;
  }
  private async readDraft(type: PortfolioEntityType, id: string): Promise<{ draftVersion: number; data: object; photos?: PortfolioStoryPhotoInputDto[] } | null> {
    if (type === PortfolioEntityType.SERVICE) {
      const row = await this.prisma.portfolioService.findUnique({ where: { id } });
      return row ? { draftVersion: Number(row.draftVersion), data: serviceDraft(row) } : null;
    }
    if (type === PortfolioEntityType.STORY) {
      const row = await this.prisma.portfolioStory.findUnique({ where: { id }, include: storyInclude });
      if (!row) return null;
      return { draftVersion: Number(row.draftVersion), ...storyDraft(row) };
    }
    const row = await this.prisma.portfolioSettings.findUnique({ where: { id }, include: settingsInclude });
    return row ? { draftVersion: Number(row.draftVersion), data: settingsDraft(row) } : null;
  }
  private async dependentPublishedReferences(tx: Prisma.TransactionClient, type: PortfolioEntityType, id: string) {
    if (type === PortfolioEntityType.SERVICE) return tx.portfolioPublishedServiceReference.count({ where: { serviceId: id } });
    if (type === PortfolioEntityType.STORY) return tx.portfolioPublishedStoryReference.count({ where: { storyId: id } });
    return 0;
  }

  private selected<T extends { uk: string; en: string }>(value: T, locale: Locale) { return value[locale]; }

  private async previewImage(ref: { mediaId: string; alt: { uk: string; en: string }; focalPoint: { x: number; y: number } | null } | null, locale: Locale) {
    if (!ref) throw incomplete();
    const media = await this.prisma.portfolioMedia.findFirst({ where: { id: ref.mediaId, status: 'READY' }, include: { variants: { orderBy: { width: 'desc' } } } });
    if (!media || !media.variants.length || !localized(ref.alt)) throw incomplete();
    const sources = media.variants.map((variant) => ({ url: `/api/portfolio/media/${media.id}/variants/${variant.id}`, width: variant.width, height: variant.height }));
    const largest = sources[0];
    return { mediaId: media.id, ...largest, sources, alt: ref.alt[locale], focalPoint: ref.focalPoint };
  }

  private async previewSeo(input: PortfolioServiceDraftInputDto['seo'], locale: Locale, path: string) {
    if (!seoComplete(input)) throw incomplete();
    return { title: this.selected(input.title, locale), description: this.selected(input.description, locale), canonicalPath: `/${locale}${path}`, shareImage: input.shareImage ? await this.previewImage(input.shareImage, locale) : null };
  }

  private async previewSite(data: PortfolioHomeDraftInputDto, row: SettingsWithRelations, locale: Locale) {
    const ids = data.servicesSection.serviceIds;
    const found = ids.length ? await this.prisma.portfolioService.findMany({ where: { id: { in: ids } } }) : [];
    const byId = new Map(found.map((service) => [service.id, service]));
    return {
      brand: PORTFOLIO_BRAND, locale, supportedLocales: ['uk', 'en'],
      contacts: row.contacts.filter((contact) => contact.visible).map(({ type, address }) => ({
        type, label: CONTACT_LABELS[type], href: type === 'email' ? `mailto:${address}` : address,
      })),
      booking: {
        intro: locale === 'uk' ? row.bookingIntroUk : row.bookingIntroEn,
        services: ids.flatMap((serviceId) => {
          const service = byId.get(serviceId);
          if (!service) return [];
          const data = serviceDraft(service);
          return [{ id: service.id, slug: service.slug, title: this.selected(data.title, locale), price: data.price }];
        }),
      },
    };
  }

  private async previewService(id: string, data: PortfolioServiceDraftInputDto, locale: Locale) {
    if (!serviceComplete(data)) throw incomplete();
    const service = await this.prisma.portfolioService.findUnique({ where: { id }, select: { id: true } });
    if (!service) throw notFound();
    const stories = await this.prisma.portfolioStory.findMany({ where: { status: 'PUBLISHED', serviceId: service.id }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], include: { publishedDocument: true } });
    const items = [];
    for (const row of stories) {
      if (!row.publishedDocument) throw new ServiceUnavailableException('Published portfolio snapshot is unavailable');
      const snapshot = await parsePortfolioSnapshot(row.publishedDocument.snapshot);
      if (snapshot.entityType !== PortfolioEntityType.STORY) throw new ServiceUnavailableException('Published portfolio snapshot is invalid');
      const cover = await this.previewImage(snapshot.data.cover, locale);
      items.push({ id: row.id, slug: row.slug, title: this.selected(snapshot.data.title, locale), subtitle: this.selected(snapshot.data.subtitle, locale), cover });
    }
    return {
      id, slug: data.slug, title: this.selected(data.title, locale), description: this.selected(data.description, locale),
      price: data.price, cardImage: await this.previewImage(data.cardImage, locale),
      seo: await this.previewSeo(data.seo, locale, `/services/${data.slug}`), stories: { items, nextCursor: null },
    };
  }

  private async previewStory(id: string, data: PortfolioStoryDraftInputDto, photos: PortfolioStoryPhotoInputDto[], locale: Locale) {
    if (!storyComplete(data, photos)) throw incomplete();
    const service = await this.prisma.portfolioService.findUnique({ where: { id: data.serviceId }, include: { publishedDocument: true } });
    if (!service) throw incomplete();
    let serviceData = serviceDraft(service);
    if (service.status === 'PUBLISHED') {
      if (!service.publishedDocument)
        throw new ServiceUnavailableException('Published portfolio snapshot is unavailable');
      const snapshot = await parsePortfolioSnapshot(service.publishedDocument.snapshot);
      if (snapshot.entityType !== PortfolioEntityType.SERVICE)
        throw new ServiceUnavailableException('Published portfolio snapshot is invalid');
      serviceData = snapshot.data;
    }
    const photoDtos = [];
    for (const photo of photos) photoDtos.push({ id: photo.id, image: await this.previewImage(photo.image, locale) });
    return {
      id, slug: data.slug, title: this.selected(data.title, locale), subtitle: this.selected(data.subtitle, locale),
      cover: await this.previewImage(data.cover, locale), description: this.selected(data.description, locale),
      service: { id: service.id, slug: service.slug, title: this.selected(serviceData.title, locale), price: serviceData.price },
      photos: photoDtos, nextStory: null, seo: await this.previewSeo(data.seo, locale, `/stories/${data.slug}`),
    };
  }

  private async previewHome(data: PortfolioHomeDraftInputDto, locale: Locale) {
    if (!settingsComplete(data)) throw incomplete();
    const services = data.servicesSection.serviceIds.length ? await this.prisma.portfolioService.findMany({ where: { id: { in: data.servicesSection.serviceIds }, status: 'PUBLISHED' }, include: { publishedDocument: true } }) : [];
    const servicesById = new Map(services.map((service) => [service.id, service]));
    const serviceCards = [];
    for (const serviceId of data.servicesSection.serviceIds) {
      const service = servicesById.get(serviceId);
      if (!service?.publishedDocument) throw incomplete();
      const snapshot = await parsePortfolioSnapshot(service.publishedDocument.snapshot);
      if (snapshot.entityType !== PortfolioEntityType.SERVICE) throw new ServiceUnavailableException('Published portfolio snapshot is invalid');
      const draft = snapshot.data;
      serviceCards.push({ id: service.id, slug: service.slug, title: this.selected(draft.title, locale), description: this.selected(draft.description, locale), price: draft.price, cardImage: await this.previewImage(draft.cardImage, locale) });
    }
    const storyIds = data.storiesSection.items.map((item) => item.storyId);
    const stories = storyIds.length ? await this.prisma.portfolioStory.findMany({ where: { id: { in: storyIds }, status: 'PUBLISHED' }, include: { publishedDocument: true } }) : [];
    const storiesById = new Map(stories.map((story) => [story.id, story]));
    const featuredStories = [];
    for (const placement of data.storiesSection.items) {
      const story = storiesById.get(placement.storyId);
      if (!story?.publishedDocument) throw incomplete();
      const snapshot = await parsePortfolioSnapshot(story.publishedDocument.snapshot);
      if (snapshot.entityType !== PortfolioEntityType.STORY) throw new ServiceUnavailableException('Published portfolio snapshot is invalid');
      featuredStories.push({ story: { id: story.id, slug: story.slug, title: this.selected(snapshot.data.title, locale), subtitle: this.selected(snapshot.data.subtitle, locale), cover: await this.previewImage(placement.image ?? snapshot.data.cover, locale) }, caption: this.selected(placement.caption.uk.trim() || placement.caption.en.trim() ? placement.caption : snapshot.data.description, locale) });
    }
    return {
      hero: { desktop: await this.previewImage(data.hero.desktop, locale), mobile: await this.previewImage(data.hero.mobile, locale) },
      servicesSection: { title: this.selected(data.servicesSection.title, locale), description: this.selected(data.servicesSection.description, locale), items: serviceCards },
      storiesSection: { title: this.selected(data.storiesSection.title, locale), items: featuredStories },
      contactSection: { title: this.selected(data.contactSection.title, locale), description: this.selected(data.contactSection.description, locale), buttonLabel: this.selected(data.contactSection.buttonLabel, locale), background: await this.previewImage(data.contactSection.background, locale) },
      seo: await this.previewSeo(data.seo, locale, '/'),
    };
  }
}

