import type { Prisma } from '@prisma/client';
import type {
  PortfolioHomeDraftInputDto,
  PortfolioServiceDraftInputDto,
} from './dto/admin-input.dto.js';
import type { PortfolioHomeDto, PortfolioSiteDto } from './dto/public.dto.js';
import { CONTACT_LABELS, LOCALES, PORTFOLIO_BRAND, type Locale } from './dto/shared.dto.js';
import { parsePortfolioSnapshot } from './persistence/portfolio-snapshot.js';

type DocumentRow = { id: string; publishedDocument: { snapshot: Prisma.JsonValue } | null };
type ImageRef = PortfolioServiceDraftInputDto['cardImage'];

export class PortfolioPublicMapper {
  private readonly services = new Map<string, Promise<PortfolioServiceDraftInputDto>>();
  private readonly sources = new Map<
    string,
    Promise<{ url: string; width: number; height: number }[]>
  >();

  constructor(
    private readonly tx: Prisma.TransactionClient,
    private readonly locale: Locale,
  ) {}

  serviceData(row: DocumentRow) {
    return this.serviceSnapshot(row.id, () => Promise.resolve(row));
  }

  private serviceSnapshot(id: string, find: () => Promise<DocumentRow | null>) {
    let data = this.services.get(id);
    if (!data) {
      data = (async () => {
        const row = await find();
        const snapshot = await parsePortfolioSnapshot(row?.publishedDocument?.snapshot);
        if (snapshot.entityType !== 'SERVICE') throw new Error('Invalid service snapshot');
        return snapshot.data;
      })();
      this.services.set(id, data);
    }
    return data;
  }

  private serviceById(id: string) {
    return this.serviceSnapshot(id, () =>
      this.tx.portfolioService.findFirst({
        where: { id, status: 'PUBLISHED' },
        include: { publishedDocument: true },
      }),
    );
  }

  async storyData(row: DocumentRow) {
    const snapshot = await parsePortfolioSnapshot(row.publishedDocument?.snapshot);
    if (snapshot.entityType !== 'STORY') throw new Error('Invalid story snapshot');
    return snapshot;
  }

  async image(ref: ImageRef) {
    if (!ref) throw new Error('Missing published image');
    const { mediaId, alt, focalPoint } = ref;
    let pending = this.sources.get(mediaId);
    if (!pending) {
      pending = this.tx.portfolioMediaVariant
        .findMany({
          where: { mediaId, format: 'webp', media: { status: 'READY' } },
          orderBy: { width: 'desc' },
          select: { id: true, width: true, height: true },
        })
        .then((variants) =>
          variants.map(({ id, width, height }) => ({
            url: '/api/public/portfolio/media/' + mediaId + '/variants/' + id,
            width,
            height,
          })),
        );
      this.sources.set(mediaId, pending);
    }
    const sources = await pending;
    if (!sources.length) throw new Error('Missing published derivatives');
    return { ...sources[0], mediaId, sources, alt: alt[this.locale], focalPoint };
  }

  async seo(input: PortfolioServiceDraftInputDto['seo'], path: string) {
    return {
      title: input.title[this.locale],
      description: input.description[this.locale],
      canonicalPath: '/' + this.locale + path,
      shareImage: input.shareImage ? await this.image(input.shareImage) : null,
    };
  }

  private bookingCard(id: string, data: PortfolioServiceDraftInputDto) {
    return { id, slug: data.slug, title: data.title[this.locale], price: data.price };
  }

  async bookingService(id: string) {
    return this.bookingCard(id, await this.serviceById(id));
  }

  private async mapServiceCard(id: string, data: PortfolioServiceDraftInputDto) {
    return {
      ...this.bookingCard(id, data),
      description: data.description[this.locale],
      cardImage: await this.image(data.cardImage),
    };
  }

  async serviceCard(row: DocumentRow) {
    return this.mapServiceCard(row.id, await this.serviceData(row));
  }

  async storyCard(row: DocumentRow) {
    const { data } = await this.storyData(row);
    const { slug, title, subtitle, cover } = data;
    return {
      id: row.id,
      slug,
      title: title[this.locale],
      subtitle: subtitle[this.locale],
      cover: await this.image(cover),
    };
  }

  async site(data: PortfolioHomeDraftInputDto): Promise<PortfolioSiteDto> {
    const services = await Promise.all(
      data.servicesSection.serviceIds.map(async (id) => {
        const service = await this.serviceById(id);
        return service.bookingEnabled ? this.bookingCard(id, service) : null;
      }),
    );
    return {
      brand: PORTFOLIO_BRAND,
      locale: this.locale,
      supportedLocales: [...LOCALES],
      contacts: data.contacts
        .filter((contact) => contact.visible)
        .map(({ type, address }) => ({
          type,
          label: CONTACT_LABELS[type],
          href: type === 'email' ? 'mailto:' + address : address,
        })),
      booking: {
        intro: data.bookingIntro[this.locale],
        services: services.filter((service) => service !== null),
      },
    };
  }

  async home(data: PortfolioHomeDraftInputDto): Promise<PortfolioHomeDto> {
    const { hero, servicesSection, storiesSection, contactSection } = data;
    const storyRows = await this.tx.portfolioStory.findMany({
      where: { id: { in: storiesSection.items.map((item) => item.storyId) }, status: 'PUBLISHED' },
      include: { publishedDocument: true },
    });
    const stories = new Map(storyRows.map((row) => [row.id, row]));
    return {
      hero: { desktop: await this.image(hero.desktop), mobile: await this.image(hero.mobile) },
      servicesSection: {
        title: servicesSection.title[this.locale],
        description: servicesSection.description[this.locale],
        items: await Promise.all(
          servicesSection.serviceIds.map(async (id) =>
            this.mapServiceCard(id, await this.serviceById(id)),
          ),
        ),
      },
      storiesSection: {
        title: storiesSection.title[this.locale],
        items: await Promise.all(
          storiesSection.items.map(async ({ storyId, caption, image }) => {
            const row = stories.get(storyId);
            if (!row) throw new Error('Missing featured story');
            const story = await this.storyCard(row);
            if (image) story.cover = await this.image(image);
            return { story, caption: caption[this.locale] };
          }),
        ),
      },
      contactSection: {
        title: contactSection.title[this.locale],
        description: contactSection.description[this.locale],
        buttonLabel: contactSection.buttonLabel[this.locale],
        background: await this.image(contactSection.background),
      },
      seo: await this.seo(data.seo, ''),
    };
  }
}
