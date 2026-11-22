import {
  BadRequestException,
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { isUUID } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service.js';
import { STORAGE_SERVICE, type StorageService } from '../storage/storage.service.js';
import { signedUrlLimits, validateSignedUrlTtl } from '../storage/signed-url-policy.js';
import { PORTFOLIO_SETTINGS_ID } from './persistence/portfolio-persistence.service.js';
import { parsePortfolioSnapshot } from './persistence/portfolio-snapshot.js';
import type { PortfolioPublicListQueryDto } from './dto/query.dto.js';
import { LOCALES, type Locale } from './dto/shared.dto.js';
import { PortfolioPublicMapper } from './portfolio-public.mapper.js';

const published = { status: 'PUBLISHED', publishedDocument: { isNot: null } } as const;
const order = [{ sortOrder: 'asc' }, { id: 'asc' }] as const;
const include = { publishedDocument: true } as const;

function missing() {
  return new NotFoundException({
    code: 'PORTFOLIO_CONTENT_NOT_FOUND',
    message: 'Portfolio content not found',
  });
}

function after(row: { sortOrder: number; id: string }) {
  return [{ sortOrder: { gt: row.sortOrder } }, { sortOrder: row.sortOrder, id: { gt: row.id } }];
}

function cursor(query: PortfolioPublicListQueryDto, scope: string, version: number) {
  if (query.cursor === undefined) return undefined;
  let value;
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(query.cursor)) throw new Error();
    value = JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
    if (
      !value ||
      value.v !== 1 ||
      value.scope !== scope ||
      value.locale !== query.locale ||
      typeof value.version !== 'number' ||
      !Number.isSafeInteger(value.version) ||
      value.version < 0 ||
      typeof value.sortOrder !== 'number' ||
      !Number.isInteger(value.sortOrder) ||
      value.sortOrder < -2147483648 ||
      value.sortOrder > 2147483647 ||
      typeof value.id !== 'string' ||
      !isUUID(value.id)
    )
      throw new Error();
  } catch {
    throw new BadRequestException({
      code: 'VALIDATION_FAILED',
      message: 'Invalid portfolio cursor',
    });
  }
  if (value.version !== version)
    throw new ConflictException({
      code: 'PORTFOLIO_CURSOR_STALE',
      message: 'Portfolio changed; restart pagination',
    });
  return { OR: after({ sortOrder: value.sortOrder, id: value.id }) };
}

function nextCursor(
  rows: { sortOrder: number; id: string }[],
  query: PortfolioPublicListQueryDto,
  scope: string,
  version: number,
) {
  if (rows.length <= query.limit) return null;
  const { sortOrder, id } = rows[query.limit - 1];
  return Buffer.from(
    JSON.stringify({ v: 1, scope, locale: query.locale, version, sortOrder, id }),
  ).toString('base64url');
}

@Injectable()
export class PortfolioPublicReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(STORAGE_SERVICE) private readonly storage: Pick<StorageService, 'createDownloadUrl'>,
  ) {}

  private async protect<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException('Portfolio is temporarily unavailable');
    }
  }

  private read<T>(
    locale: Locale,
    operation: (
      tx: Prisma.TransactionClient,
      mapper: PortfolioPublicMapper,
      version: number,
    ) => Promise<T>,
  ) {
    return this.protect(() =>
      this.prisma.$transaction(
        async (tx) => {
          const state = await tx.portfolioContentState.findUniqueOrThrow({ where: { id: 1 } });
          const version = Number(state.contentVersion);
          if (!Number.isSafeInteger(version) || version < 0)
            throw new Error('Invalid content version');
          return operation(tx, new PortfolioPublicMapper(tx, locale), version);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
      ),
    );
  }

  private async settings(tx: Prisma.TransactionClient) {
    const row = await tx.portfolioSettings.findFirst({
      where: { id: PORTFOLIO_SETTINGS_ID, ...published },
      include,
    });
    if (!row?.publishedDocument) throw missing();
    const snapshot = await parsePortfolioSnapshot(row.publishedDocument.snapshot);
    if (snapshot.entityType !== 'SETTINGS') throw new Error('Invalid settings snapshot');
    return snapshot.data;
  }

  site(locale: Locale) {
    return this.read(locale, async (tx, mapper, contentVersion) => ({
      data: await mapper.site(await this.settings(tx)),
      contentVersion,
    }));
  }

  home(locale: Locale) {
    return this.read(locale, async (tx, mapper, contentVersion) => {
      const settings = await this.settings(tx);
      const site = await mapper.site(settings);
      const page = await mapper.home(settings);
      return { site, page, contentVersion };
    });
  }

  services(query: PortfolioPublicListQueryDto) {
    return this.read(query.locale, async (tx, mapper, contentVersion) => {
      const scope = 'services';
      const rows = await tx.portfolioService.findMany({
        where: { ...published, ...cursor(query, scope, contentVersion) },
        orderBy: [...order],
        include,
        take: query.limit + 1,
      });
      const items = await Promise.all(
        rows.slice(0, query.limit).map((row) => mapper.serviceCard(row)),
      );
      return {
        items,
        nextCursor: nextCursor(rows, query, scope, contentVersion),
        locale: query.locale,
        contentVersion,
      };
    });
  }

  service(slug: string, query: PortfolioPublicListQueryDto) {
    return this.read(query.locale, async (tx, mapper, contentVersion) => {
      const row = await tx.portfolioService.findFirst({ where: { slug, ...published }, include });
      if (!row) throw missing();
      const scope = 'service:' + row.id;
      const stories = await tx.portfolioStory.findMany({
        where: {
          ...published,
          ...cursor(query, scope, contentVersion),
          publishedDocument: { is: { serviceReferences: { some: { serviceId: row.id } } } },
        },
        orderBy: [...order],
        include,
        take: query.limit + 1,
      });
      const items = await Promise.all(
        stories.slice(0, query.limit).map((story) => mapper.storyCard(story)),
      );
      const data = await mapper.serviceData(row);
      return {
        site: await mapper.site(await this.settings(tx)),
        contentVersion,
        page: {
          ...(await mapper.serviceCard(row)),
          seo: await mapper.seo(data.seo, '/services/' + data.slug),
          stories: { items, nextCursor: nextCursor(stories, query, scope, contentVersion) },
        },
      };
    });
  }

  story(slug: string, locale: Locale) {
    return this.read(locale, async (tx, mapper, contentVersion) => {
      const row = await tx.portfolioStory.findFirst({ where: { slug, ...published }, include });
      if (!row) throw missing();
      const snapshot = await mapper.storyData(row);
      const next = await tx.portfolioStory.findFirst({
        where: { ...published, OR: after(row) },
        orderBy: [...order],
        include,
      });
      const { data, photos } = snapshot;
      return {
        site: await mapper.site(await this.settings(tx)),
        contentVersion,
        page: {
          ...(await mapper.storyCard(row)),
          description: data.description[locale],
          service: await mapper.bookingService(data.serviceId),
          photos: await Promise.all(
            photos.map(async (photo) => ({ id: photo.id, image: await mapper.image(photo.image) })),
          ),
          nextStory: next ? await mapper.storyCard(next) : null,
          seo: await mapper.seo(data.seo, '/stories/' + data.slug),
        },
      };
    });
  }

  sitemap() {
    return this.read('en', async (tx, _mapper, contentVersion) => {
      const home = await tx.portfolioPublishedDocument.findFirst({
        where: { settings: { id: PORTFOLIO_SETTINGS_ID, status: 'PUBLISHED' } },
        select: { publishedAt: true },
      });
      if (!home) return { contentVersion, items: [] };
      const stories = await tx.portfolioStory.findMany({
        where: published,
        orderBy: [...order],
        select: { slug: true, publishedDocument: { select: { publishedAt: true } } },
      });
      const entries = [
        { path: '', date: home.publishedAt },
        ...stories.map((story) => ({
          path: '/stories/' + story.slug,
          date: story.publishedDocument!.publishedAt,
        })),
      ];
      return {
        contentVersion,
        items: entries.flatMap(({ path, date }) => {
          const alternates = LOCALES.map((locale) => ({ locale, path: '/' + locale + path }));
          return alternates.map((item) => ({ ...item, alternates, updatedAt: date.toISOString() }));
        }),
      };
    });
  }

  derivative(mediaId: string, variantId: string) {
    return this.protect(async () => {
      const variant = await this.prisma.portfolioMediaVariant.findFirst({
        where: {
          id: variantId,
          mediaId,
          format: 'webp',
          media: {
            status: 'READY',
            publishedReferences: {
              some: {
                document: {
                  OR: [
                    { service: { status: 'PUBLISHED' } },
                    { story: { status: 'PUBLISHED' } },
                    { settings: { status: 'PUBLISHED' } },
                  ],
                },
              },
            },
          },
        },
        select: { key: true },
      });
      const prefix = 'portfolio/media/' + mediaId + '/variants/';
      if (
        !variant ||
        !variant.key.startsWith(prefix) ||
        !/^[a-zA-Z0-9-]+\/[1-9][0-9]*\.webp$/.test(variant.key.slice(prefix.length))
      )
        throw missing();
      const expiresIn = validateSignedUrlTtl(
        Number(this.config.getOrThrow('SIGNED_URL_PREVIEW_TTL')),
        signedUrlLimits.preview,
      );
      return this.storage.createDownloadUrl({
        key: variant.key,
        expiresIn,
        cacheControl: 'private, no-store',
      });
    });
  }
}
