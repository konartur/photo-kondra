import 'reflect-metadata';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  PortfolioHomeDraftInputDto, PortfolioServiceDraftInputDto, PortfolioStoryDraftInputDto, ReplaceStoryPhotosDto,
} from '../dist/portfolio/dto/admin-input.dto.js';

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const sourceUrl = (source) => 'https://images.unsplash.com/photo-' + source;

function stableId(kind, key) {
  const hash = sha256('photokondra/portfolio-demo/v1/' + kind + '/' + key);
  return [hash.slice(0, 8), hash.slice(8, 12), '8' + hash.slice(13, 16), 'a' + hash.slice(17, 20), hash.slice(20, 32)].join('-');
}

async function dto(type, value) {
  const instance = plainToInstance(type, value);
  const errors = await validate(instance, {
    whitelist: true, forbidNonWhitelisted: true, validationError: { target: false, value: false },
  });
  if (errors.length) throw new Error('Invalid demo ' + type.name + ': ' + errors.map(error => error.property).join(', '));
  return JSON.parse(JSON.stringify(instance));
}

export async function buildDemoPlan() {
  const manifestUrl = new URL('../../docs/portfolio-content/demo-import.v1.json', import.meta.url);
  const inventoryUrl = new URL('../../docs/portfolio-content/media-inventory.json', import.meta.url);
  const bytes = await readFile(manifestUrl);
  const manifest = JSON.parse(bytes);
  const inventory = JSON.parse(await readFile(inventoryUrl));
  const { home } = manifest;
  const inventoryMap = manifest.stories.map(({ slug, photos }) => ({ slug, sourcePhotoIds: photos.map(photo => photo.source) }));
  if (manifest.schemaVersion !== 1 || !manifest.demo || !isDeepStrictEqual(inventoryMap, inventory.stories) ||
      home.hero !== inventory.homeReferences.hero || home.background !== inventory.homeReferences.contactBackground ||
      !isDeepStrictEqual(home.serviceSlugs, inventory.stories.map(({ slug }) => slug)))
    throw new Error('Demo manifest does not match the repository inventory');

  const all = manifest.stories.flatMap(story => story.photos);
  const assets = new Map(all.map(photo => [photo.source, {
    source: photo.source, id: stableId('media', photo.source), alt: photo.alt, url: sourceUrl(photo.source),
  }]));
  if (assets.size !== 21 || manifest.stories.length !== 6 ||
      all.some(photo => !/^(?:\d{10}|\d{13})-[0-9a-f]{12}$/.test(photo.source)))
    throw new Error('Expected six stories and 21 unique Unsplash photos');

  function image(source, alt, focalPoint = null) {
    const asset = assets.get(source);
    if (!asset) throw new Error('Unknown demo source: ' + source);
    return { mediaId: asset.id, alt: alt ?? asset.alt, focalPoint };
  }

  const stories = [];
  for (const [sortOrder, item] of manifest.stories.entries()) {
    if (!item.photos.some(photo => photo.source === item.cover) || !item.photos.some(photo => photo.source === item.serviceCard))
      throw new Error('Invalid cover or service card in ' + item.slug);
    const serviceId = stableId('service', item.slug);
    const storyId = stableId('story', item.slug);
    const seo = { title: item.title, description: item.subtitle, shareImage: image(item.cover) };
    const service = await dto(PortfolioServiceDraftInputDto, {
      slug: item.slug, title: item.title, description: item.subtitle,
      price: manifest.price, bookingEnabled: true, cardImage: image(item.serviceCard), seo,
    });
    const story = await dto(PortfolioStoryDraftInputDto, {
      slug: item.slug, title: item.title, subtitle: item.subtitle, description: item.subtitle,
      serviceId, cover: image(item.cover), seo,
    });
    const { items: photos } = await dto(ReplaceStoryPhotosDto, {
      expectedVersion: 1,
      items: item.photos.filter(photo => photo.source !== item.cover).map(photo => ({
        id: stableId('photo', item.slug + '/' + photo.source), image: image(photo.source),
      })),
    });
    stories.push({ slug: item.slug, serviceId, storyId, sortOrder, service, story, photos });
  }

  const bySlug = new Map(stories.map(story => [story.slug, story]));
  const settings = await dto(PortfolioHomeDraftInputDto, {
    brand: manifest.brand,
    contacts: [],
    bookingIntro: {
      uk: home.bookingIntro.uk + ' ' + home.contactPlaceholder.uk,
      en: home.bookingIntro.en + ' ' + home.contactPlaceholder.en,
    },
    hero: { desktop: image(home.hero, home.heroAlt), mobile: image(home.hero, home.heroAlt, { x: 0.5, y: 0.45 }) },
    servicesSection: {
      title: home.servicesTitle, description: home.servicesDescription,
      serviceIds: home.serviceSlugs.map(slug => bySlug.get(slug).serviceId),
    },
    storiesSection: {
      title: home.storiesTitle,
      items: home.featured.map(({ slug, source, caption }) => {
        if (!manifest.stories.find(item => item.slug === slug)?.photos.some(photo => photo.source === source))
          throw new Error('Invalid featured source in ' + slug);
        return { storyId: bySlug.get(slug).storyId, caption, image: image(source) };
      }),
    },
    contactSection: {
      title: home.contactTitle,
      description: {
        uk: home.contactEyebrow.uk + '. ' + home.contactDescription.uk,
        en: home.contactEyebrow.en + '. ' + home.contactDescription.en,
      },
      buttonLabel: home.button, background: image(home.background),
    },
    seo: { title: home.seoTitle, description: home.seoDescription, shareImage: image(home.hero, home.heroAlt) },
  });

  return { manifestSha256: sha256(bytes), assets: [...assets.values()], stories, settings };
}
