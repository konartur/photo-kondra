// Generated from NestJS Portfolio OpenAPI schemas. Do not edit.
// Regenerate: npm --prefix backend run portfolio:contracts

export type AdminPortfolioEntityBaseDto = {
  id: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  draftVersion: number;
  publishedVersion: number | null;
  hasUnpublishedChanges: boolean;
  publishedAt: string | null;
  updatedAt: string;
};

export type AdminPortfolioMediaDto = {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: string;
  width: number | null;
  height: number | null;
  status: 'UPLOADING' | 'PROCESSING' | 'READY' | 'FAILED' | 'DELETED';
  previewUrl: string | null;
  createdAt: string;
};

export type AdminPortfolioMediaListDto = {
  items: Array<AdminPortfolioMediaDto>;
  nextCursor: string | null;
};

export type AdminPortfolioServiceDto = {
  id: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  draftVersion: number;
  publishedVersion: number | null;
  hasUnpublishedChanges: boolean;
  publishedAt: string | null;
  updatedAt: string;
  draft: PortfolioServiceDraftInputDto;
};

export type AdminPortfolioServiceListDto = {
  items: Array<AdminPortfolioSummaryDto>;
  nextCursor: string | null;
};

export type AdminPortfolioSettingsDto = {
  id: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  draftVersion: number;
  publishedVersion: number | null;
  hasUnpublishedChanges: boolean;
  publishedAt: string | null;
  updatedAt: string;
  draft: PortfolioHomeDraftInputDto;
};

export type AdminPortfolioStoryDto = {
  id: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  draftVersion: number;
  publishedVersion: number | null;
  hasUnpublishedChanges: boolean;
  publishedAt: string | null;
  updatedAt: string;
  draft: PortfolioStoryDraftInputDto;
  photos: Array<PortfolioStoryPhotoInputDto>;
};

export type AdminPortfolioStoryListDto = {
  items: Array<AdminPortfolioSummaryDto>;
  nextCursor: string | null;
};

export type AdminPortfolioSummaryDto = {
  id: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  draftVersion: number;
  publishedVersion: number | null;
  hasUnpublishedChanges: boolean;
  publishedAt: string | null;
  updatedAt: string;
  slug: string;
  title: LocalizedTitleDto;
};

export type ApiErrorDto = {
  statusCode: number;
  code: string;
  message: string;
};

export type FeaturedPortfolioStoryDto = {
  story: PortfolioStoryCardDto;
  caption: string;
};

export type FocalPointDto = {
  x: number;
  y: number;
};

export type ImageVariantDto = {
  url: string;
  width: number;
  height: number;
};

export type LocalizedAltDto = {
  uk: string;
  en: string;
};

export type LocalizedSeoDescriptionDto = {
  uk: string;
  en: string;
};

export type LocalizedSubtitleDto = {
  uk: string;
  en: string;
};

export type LocalizedTextDto = {
  uk: string;
  en: string;
};

export type LocalizedTitleDto = {
  uk: string;
  en: string;
};

export type PortfolioApiErrorDto = {
  statusCode: number;
  code: string;
  message: string;
  errors?: Array<PortfolioValidationErrorDto>;
};

export type PortfolioBookingDto = {
  intro: string;
  services: Array<PortfolioBookingServiceDto>;
};

export type PortfolioBookingServiceDto = {
  id: string;
  slug: string;
  title: string;
  price: PortfolioPriceDto | null;
};

export type PortfolioContactDto = {
  type: 'instagram' | 'telegram' | 'email';
  label: string;
  href: string;
};

export type PortfolioContactInputDto = {
  type: 'instagram' | 'telegram' | 'email';
  label?: LocalizedTitleDto;
  address: string;
  visible: boolean;
};

export type PortfolioContactSectionDto = {
  title: string;
  description: string;
  buttonLabel: string;
  background: PortfolioImageDto;
};

export type PortfolioContactSectionInputDto = {
  title: LocalizedTitleDto;
  description: LocalizedTextDto;
  buttonLabel: LocalizedTitleDto;
  background: PortfolioImageRefDto | null;
};

export type PortfolioFeaturedStoryInputDto = {
  storyId: string;
  caption: LocalizedTextDto;
  image?: PortfolioImageRefDto | null;
};

export type PortfolioHeroDto = {
  desktop: PortfolioImageDto;
  mobile: PortfolioImageDto;
};

export type PortfolioHeroInputDto = {
  desktop: PortfolioImageRefDto | null;
  mobile: PortfolioImageRefDto | null;
};

export type PortfolioHomeDraftInputDto = {
  brand: string;
  contacts: Array<PortfolioContactInputDto>;
  bookingIntro: LocalizedTextDto;
  hero: PortfolioHeroInputDto;
  servicesSection: PortfolioServicesSectionInputDto;
  storiesSection: PortfolioStoriesSectionInputDto;
  contactSection: PortfolioContactSectionInputDto;
  seo: PortfolioSeoInputDto;
};

export type PortfolioHomeDraftUpdateDto = {
  expectedVersion: number;
  data: PortfolioHomeDraftInputDto;
};

export type PortfolioHomeDto = {
  hero: PortfolioHeroDto;
  servicesSection: PortfolioServicesSectionDto;
  storiesSection: PortfolioStoriesSectionDto;
  contactSection: PortfolioContactSectionDto;
  seo: PortfolioSeoDto;
};

export type PortfolioHomePageDto = {
  site: PortfolioSiteDto;
  contentVersion: number;
  page: PortfolioHomeDto;
};

export type PortfolioHomePreviewDto = {
  draftVersion: number;
  site: PortfolioSiteDto;
  page: PortfolioHomeDto;
};

export type PortfolioImageDto = {
  url: string;
  width: number;
  height: number;
  mediaId: string;
  sources: Array<ImageVariantDto>;
  alt: string;
  focalPoint: FocalPointDto | null;
};

export type PortfolioImageRefDto = {
  mediaId: string;
  alt: LocalizedAltDto;
  focalPoint: FocalPointDto | null;
};

export type PortfolioListQueryDto = {
  limit?: number;
  cursor?: string;
};

export type PortfolioLocaleQueryDto = {
  locale?: 'uk' | 'en';
};

export type PortfolioMediaListQueryDto = {
  limit?: number;
  cursor?: string;
  search?: string;
};

export type PortfolioPageBaseDto = {
  site: PortfolioSiteDto;
  contentVersion: number;
};

export type PortfolioPreviewBaseDto = {
  draftVersion: number;
  site: PortfolioSiteDto;
};

export type PortfolioPriceDto = {
  amountMinor: number;
  currency: 'UAH';
  durationMinutes: number;
};

export type PortfolioPublicListQueryDto = {
  limit?: number;
  cursor?: string;
  locale?: 'uk' | 'en';
};

export type PortfolioPublicationResponseDto = {
  id: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  draftVersion: number;
  publishedVersion: number | null;
  contentVersion: number;
  publishedAt: string | null;
};

export type PortfolioSeoDto = {
  title: string;
  description: string;
  canonicalPath: string;
  shareImage: PortfolioImageDto | null;
};

export type PortfolioSeoInputDto = {
  title: LocalizedTitleDto;
  description: LocalizedSeoDescriptionDto;
  shareImage: PortfolioImageRefDto | null;
};

export type PortfolioServiceCardDto = {
  id: string;
  slug: string;
  title: string;
  price: PortfolioPriceDto | null;
  description: string;
  cardImage: PortfolioImageDto;
};

export type PortfolioServiceDraftInputDto = {
  slug: string;
  title: LocalizedTitleDto;
  description: LocalizedTextDto;
  price: PortfolioPriceDto | null;
  cardImage: PortfolioImageRefDto | null;
  bookingEnabled: boolean;
  seo: PortfolioSeoInputDto;
};

export type PortfolioServiceDraftUpdateDto = {
  expectedVersion: number;
  data: PortfolioServiceDraftInputDto;
};

export type PortfolioServiceDto = {
  id: string;
  slug: string;
  title: string;
  price: PortfolioPriceDto | null;
  description: string;
  cardImage: PortfolioImageDto;
  seo: PortfolioSeoDto;
  stories: PortfolioStoryCardPageDto;
};

export type PortfolioServiceListDto = {
  items: Array<PortfolioServiceCardDto>;
  nextCursor: string | null;
  locale: 'uk' | 'en';
  contentVersion: number;
};

export type PortfolioServicePageDto = {
  site: PortfolioSiteDto;
  contentVersion: number;
  page: PortfolioServiceDto;
};

export type PortfolioServicePreviewDto = {
  draftVersion: number;
  site: PortfolioSiteDto;
  page: PortfolioServiceDto;
};

export type PortfolioServicesSectionDto = {
  title: string;
  description: string;
  items: Array<PortfolioServiceCardDto>;
};

export type PortfolioServicesSectionInputDto = {
  title: LocalizedTitleDto;
  description: LocalizedTextDto;
  serviceIds: Array<string>;
};

export type PortfolioSiteDto = {
  brand: string;
  locale: 'uk' | 'en';
  supportedLocales: Array<'uk' | 'en'>;
  contacts: Array<PortfolioContactDto>;
  booking: PortfolioBookingDto;
};

export type PortfolioSiteResponseDto = {
  data: PortfolioSiteDto;
  contentVersion: number;
};

export type PortfolioSitemapAlternateDto = {
  locale: 'uk' | 'en';
  path: string;
};

export type PortfolioSitemapDto = {
  contentVersion: number;
  items: Array<PortfolioSitemapItemDto>;
};

export type PortfolioSitemapItemDto = {
  locale: 'uk' | 'en';
  path: string;
  alternates: Array<PortfolioSitemapAlternateDto>;
  updatedAt: string;
};

export type PortfolioStoriesSectionDto = {
  title: string;
  items: Array<FeaturedPortfolioStoryDto>;
};

export type PortfolioStoriesSectionInputDto = {
  title: LocalizedTitleDto;
  items: Array<PortfolioFeaturedStoryInputDto>;
};

export type PortfolioStoryCardDto = {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  cover: PortfolioImageDto;
};

export type PortfolioStoryCardPageDto = {
  items: Array<PortfolioStoryCardDto>;
  nextCursor: string | null;
};

export type PortfolioStoryDraftCreateDto = {
  data: PortfolioStoryDraftInputDto;
  items: Array<PortfolioStoryPhotoInputDto>;
};

export type PortfolioStoryDraftInputDto = {
  slug: string;
  title: LocalizedTitleDto;
  subtitle: LocalizedSubtitleDto;
  description: LocalizedTextDto;
  serviceId: string;
  cover: PortfolioImageRefDto | null;
  seo: PortfolioSeoInputDto;
};

export type PortfolioStoryDraftSaveDto = {
  data: PortfolioStoryDraftInputDto;
  items: Array<PortfolioStoryPhotoInputDto>;
  expectedVersion: number;
};

export type PortfolioStoryDraftUpdateDto = {
  expectedVersion: number;
  data: PortfolioStoryDraftInputDto;
};

export type PortfolioStoryDto = {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  cover: PortfolioImageDto;
  description: string;
  service: PortfolioBookingServiceDto;
  photos: Array<PortfolioStoryPhotoDto>;
  nextStory: PortfolioStoryCardDto | null;
  seo: PortfolioSeoDto;
};

export type PortfolioStoryPageDto = {
  site: PortfolioSiteDto;
  contentVersion: number;
  page: PortfolioStoryDto;
};

export type PortfolioStoryPhotoDto = {
  id: string;
  image: PortfolioImageDto;
};

export type PortfolioStoryPhotoInputDto = {
  id: string;
  image: PortfolioImageRefDto;
};

export type PortfolioStoryPreviewDto = {
  draftVersion: number;
  site: PortfolioSiteDto;
  page: PortfolioStoryDto;
};

export type PortfolioUploadHeadersDto = {
  'Content-Type': string;
  'If-None-Match': '*';
};

export type PortfolioUploadResponseDto = {
  mediaId: string;
  uploadUrl: string;
  expiresIn: number;
  requiredHeaders: PortfolioUploadHeadersDto;
};

export type PortfolioValidationErrorDto = {
  field: string;
  code: string;
  params?: PortfolioValidationParamsDto;
};

export type PortfolioValidationParamsDto = {
  min?: number;
  max?: number;
};

export type PublicationCommandDto = {
  expectedVersion: number;
};

export type ReplaceStoryPhotosDto = {
  expectedVersion: number;
  items: Array<PortfolioStoryPhotoInputDto>;
};

export type RequestPortfolioUploadDto = {
  filename: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  sizeBytes: number;
};
