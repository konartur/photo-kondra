import type {
  PortfolioHomeDraftInputDto, PortfolioImageRefDto, PortfolioServiceDraftInputDto,
  PortfolioStoryDraftInputDto, PortfolioStoryPhotoInputDto,
} from './dto/admin-input.dto.js';
import { storyPhotoLimitSatisfied } from './dto/admin-input.dto.js';

type Draft = PortfolioServiceDraftInputDto | PortfolioStoryDraftInputDto | PortfolioHomeDraftInputDto;
export type PortfolioReadinessError = { field: string; code: string };

/** Domain completeness belongs to publication; draft DTOs only validate admissible values. */
export function portfolioReadinessErrors(data: Draft, photos: readonly PortfolioStoryPhotoInputDto[] = []): PortfolioReadinessError[] {
  const errors: PortfolioReadinessError[] = [];
  const required = (field: string, value: string) => { if (!value.trim()) errors.push({ field, code: 'REQUIRED_FOR_PUBLICATION' }); };
  const localized = (field: string, value: { uk: string; en: string }) => {
    required(field + '.uk', value.uk); required(field + '.en', value.en);
  };
  const image = (field: string, value: PortfolioImageRefDto | null) => {
    if (value) localized(field + '.alt', value.alt);
    else errors.push({ field: field + '.mediaId', code: 'IMAGE_REQUIRED' });
  };
  localized('seo.title', data.seo.title);
  localized('seo.description', data.seo.description);
  if (data.seo.shareImage) image('seo.shareImage', data.seo.shareImage);
  if ('brand' in data) {
    localized('bookingIntro', data.bookingIntro);
    image('hero.desktop', data.hero.desktop); image('hero.mobile', data.hero.mobile);
    localized('servicesSection.title', data.servicesSection.title);
    localized('servicesSection.description', data.servicesSection.description);
    localized('storiesSection.title', data.storiesSection.title);
    localized('contactSection.title', data.contactSection.title);
    localized('contactSection.description', data.contactSection.description);
    localized('contactSection.buttonLabel', data.contactSection.buttonLabel);
    image('contactSection.background', data.contactSection.background);
    if (!data.servicesSection.serviceIds.length) errors.push({ field: 'servicesSection.serviceIds', code: 'REQUIRED_FOR_PUBLICATION' });
    if (!data.storiesSection.items.length) errors.push({ field: 'storiesSection.items', code: 'REQUIRED_FOR_PUBLICATION' });
    data.storiesSection.items.forEach((item, index) => {
      localized(`storiesSection.items.${index}.caption`, item.caption);
      if (item.image) image(`storiesSection.items.${index}.image`, item.image);
    });
    data.contacts.forEach((contact, index) => required(`contacts.${index}.address`, contact.address));
  } else {
    required('slug', data.slug); localized('title', data.title); localized('description', data.description);
    if ('cover' in data) {
      required('serviceId', data.serviceId); localized('subtitle', data.subtitle); image('cover', data.cover);
      if (!photos.length) errors.push({ field: 'items', code: 'REQUIRED_FOR_PUBLICATION' });
      if (photos.length > 10 || !storyPhotoLimitSatisfied(data.cover?.mediaId ?? null, photos.map(photo => photo.image.mediaId)))
        errors.push({ field: 'items', code: 'PHOTO_LIMIT_EXCEEDED' });
      photos.forEach((photo, index) => image(`items.${index}.image`, photo.image));
    } else {
      image('cardImage', data.cardImage);
      if (data.bookingEnabled && !data.price) errors.push({ field: 'price', code: 'REQUIRED_FOR_PUBLICATION' });
    }
  }
  return errors;
}

/** Paths let publication report unavailable media without exposing IDs or storage keys. */
export function portfolioMediaFields(data: Draft, photos: readonly PortfolioStoryPhotoInputDto[] = []) {
  const fields: { field: string; mediaId: string }[] = [];
  const add = (field: string, value: PortfolioImageRefDto | null) => { if (value) fields.push({ field: field + '.mediaId', mediaId: value.mediaId }); };
  add('seo.shareImage', data.seo.shareImage);
  if ('cardImage' in data) add('cardImage', data.cardImage);
  if ('cover' in data) {
    add('cover', data.cover);
    photos.forEach((photo, index) => add(`items.${index}.image`, photo.image));
  }
  if ('hero' in data) {
    add('hero.desktop', data.hero.desktop); add('hero.mobile', data.hero.mobile);
    add('contactSection.background', data.contactSection.background);
    data.storiesSection.items.forEach((item, index) => add(`storiesSection.items.${index}.image`, item.image ?? null));
  }
  return fields;
}
