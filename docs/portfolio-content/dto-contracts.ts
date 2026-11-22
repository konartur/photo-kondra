/**
 * Portfolio wire contracts — design reference, not runtime NestJS DTOs.
 * Implement decorated classes and OpenAPI schemas in ticket PF-CONTENT-01.
 * UUID/ISO strings, integer ranges and publication rules are runtime-validated.
 */
// Reference limits; implementation must enforce them in DTOs and domain operations.
export const PORTFOLIO_MAX_PHOTOS_PER_STORY = 10;
export const PORTFOLIO_MAX_UPLOAD_BYTES = 10_000_000;
export const PORTFOLIO_WEBP_WIDTHS = [480, 960, 1600] as const;
// No fixed total portfolio image cap; initial import contains 21 unique images.
export type Locale = 'uk' | 'en';
export interface LocalizedTextDto { uk: string; en: string }
export interface PortfolioLocaleQueryDto { locale: Locale } // Legacy omission defaults to en.
export type UUID = string;
export type ISODateTime = string;
export type PublicationStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export type MediaStatus = 'UPLOADING' | 'PROCESSING' | 'READY' | 'FAILED' | 'DELETED';
export type ContactType = 'instagram' | 'telegram' | 'email';

export interface PortfolioPriceDto {
  amountMinor: number; // Integer, 0..100_000_000; UAH kopecks.
  currency: 'UAH';
  durationMinutes: number; // Integer, 1..1440.
}
export interface FocalPointDto { x: number; y: number } // Each 0..1.
export interface ImageVariantDto {
  url: string; // Stable same-origin media route; never a storage key or original URL.
  width: number;
  height: number;
}
export interface PortfolioImageDto {
  mediaId: UUID;
  url: string;
  width: number;
  height: number;
  sources: ImageVariantDto[];
  alt: string;
  focalPoint: FocalPointDto | null;
}
export interface PortfolioSeoDto {
  title: string;
  description: string;
  canonicalPath: string; // Server-derived, starts with /.
  shareImage: PortfolioImageDto | null;
}
export interface PortfolioContactDto {
  type: ContactType;
  label: string;
  href: string; // Validated channel URL / mailto, no booking data.
}
export interface PortfolioBookingServiceDto {
  id: UUID;
  slug: string;
  title: string;
  price: PortfolioPriceDto | null; // null = individually agreed; never "free".
}
export interface PortfolioSiteDto {
  brand: string;
  locale: Locale;
  supportedLocales: Locale[]; // Always uk and en.
  contacts: PortfolioContactDto[];
  booking: { intro: string; services: PortfolioBookingServiceDto[] };
}
export interface PortfolioServiceCardDto extends PortfolioBookingServiceDto {
  description: string;
  cardImage: PortfolioImageDto;
}
export interface PortfolioStoryCardDto {
  id: UUID;
  slug: string;
  title: string;
  subtitle: string;
  cover: PortfolioImageDto;
}
export interface FeaturedPortfolioStoryDto {
  story: PortfolioStoryCardDto;
  caption: string;
}
export interface PortfolioHomeDto {
  hero: { desktop: PortfolioImageDto; mobile: PortfolioImageDto };
  servicesSection: {
    title: string;
    description: string;
    items: PortfolioServiceCardDto[]; // Expanded cards; no second lookup for IDs.
  };
  storiesSection: { title: string; items: FeaturedPortfolioStoryDto[] };
  contactSection: {
    title: string;
    description: string;
    buttonLabel: string;
    background: PortfolioImageDto;
  };
  seo: PortfolioSeoDto;
}
export interface CursorPageDto<T> { items: T[]; nextCursor: string | null }
export interface PortfolioServiceDto extends PortfolioServiceCardDto {
  seo: PortfolioSeoDto;
  stories: CursorPageDto<PortfolioStoryCardDto>;
}
export interface PortfolioStoryPhotoDto {
  id: UUID; // Placement ID, independent from mediaId.
  image: PortfolioImageDto;
}
export interface PortfolioStoryDto extends PortfolioStoryCardDto {
  description: string;
  service: PortfolioBookingServiceDto;
  photos: PortfolioStoryPhotoDto[]; // At most 10 unique images including cover.
  nextStory: PortfolioStoryCardDto | null;
  seo: PortfolioSeoDto;
}
export interface PortfolioPageDto<T> {
  site: PortfolioSiteDto;
  page: T;
  contentVersion: number; // Monotonic global publication counter; one consistent read.
}
export interface PortfolioSitemapDto {
  contentVersion: number;
  items: { path: string; locale: Locale; alternates: { locale: Locale; path: string }[]; updatedAt: ISODateTime }[];
}

// Public strings above are selected by locale; all admin editorial texts below carry both languages.
export interface PortfolioServiceListDto extends CursorPageDto<PortfolioServiceCardDto> {
  locale: Locale;
  contentVersion: number;
}

// Admin write DTOs carry references, not trusted rendering URLs.
export interface PortfolioImageRefDto {
  mediaId: UUID;
  alt: LocalizedTextDto;
  focalPoint: FocalPointDto | null;
}
export interface PortfolioSeoInputDto {
  title: LocalizedTextDto;
  description: LocalizedTextDto;
  shareImage: PortfolioImageRefDto | null;
}
export interface PortfolioContactInputDto {
  type: ContactType;
  label: LocalizedTextDto;
  address: string; // Validated HTTPS profile or email; href derived server-side.
  visible: boolean;
}
export interface PortfolioServiceDraftInputDto {
  slug: string;
  title: LocalizedTextDto;
  description: LocalizedTextDto;
  price: PortfolioPriceDto | null;
  cardImage: PortfolioImageRefDto | null; // Missing media permitted in draft.
  bookingEnabled: boolean;
  seo: PortfolioSeoInputDto;
}
export interface PortfolioStoryDraftInputDto {
  slug: string;
  title: LocalizedTextDto;
  subtitle: LocalizedTextDto;
  description: LocalizedTextDto;
  serviceId: UUID;
  cover: PortfolioImageRefDto | null;
  seo: PortfolioSeoInputDto;
}
export interface PortfolioHomeDraftInputDto {
  brand: string;
  contacts: PortfolioContactInputDto[];
  bookingIntro: LocalizedTextDto;
  hero: { desktop: PortfolioImageRefDto | null; mobile: PortfolioImageRefDto | null };
  servicesSection: { title: LocalizedTextDto; description: LocalizedTextDto; serviceIds: UUID[] };
  storiesSection: { title: LocalizedTextDto; items: { storyId: UUID; caption: LocalizedTextDto; image?: PortfolioImageRefDto | null }[] };
  contactSection: {
    title: LocalizedTextDto;
    description: LocalizedTextDto;
    buttonLabel: LocalizedTextDto;
    background: PortfolioImageRefDto | null;
  };
  seo: PortfolioSeoInputDto;
}
export interface DraftUpdateDto<T> { expectedVersion: number; data: T }
export interface PublicationCommandDto { expectedVersion: number }
export interface PortfolioStoryPhotoInputDto {
  id: UUID; // Client-generated placement UUID, stable across reorder/retry.
  image: PortfolioImageRefDto;
}
export interface ReplaceStoryPhotosDto {
  expectedVersion: number;
  items: PortfolioStoryPhotoInputDto[]; // Union of cover + items has at most 10 media IDs.
}
export interface AdminPortfolioEntityDto<T> {
  id: UUID;
  status: PublicationStatus;
  draftVersion: number;
  publishedVersion: number | null;
  hasUnpublishedChanges: boolean;
  draft: T;
  publishedAt: ISODateTime | null;
  updatedAt: ISODateTime;
}
export interface AdminPortfolioStoryDto extends AdminPortfolioEntityDto<PortfolioStoryDraftInputDto> {
  photos: PortfolioStoryPhotoInputDto[]; // Same story-wide limit, cover included.
}
export interface AdminPortfolioMediaDto {
  id: UUID;
  filename: string;
  mimeType: string;
  sizeBytes: string; // BigInt serialized as decimal string.
  width: number | null;
  height: number | null;
  status: MediaStatus;
  previewUrl: string | null; // Authenticated route, never public draft access.
  createdAt: ISODateTime;
}
export interface RequestPortfolioUploadDto {
  filename: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  sizeBytes: number; // Positive safe integer, at most PORTFOLIO_MAX_UPLOAD_BYTES.
}
export interface PortfolioUploadResponseDto {
  mediaId: UUID;
  uploadUrl: string;
  expiresIn: number;
  requiredHeaders: { 'Content-Type': string; 'If-None-Match': '*' };
}
export interface PortfolioPublicationResponseDto {
  id: UUID;
  status: PublicationStatus;
  draftVersion: number;
  publishedVersion: number | null;
  contentVersion: number;
  publishedAt: ISODateTime | null;
}
export interface PortfolioPreviewDto<T> {
  draftVersion: number;
  site: PortfolioSiteDto;
  page: T; // Only after draft completeness validation; private media URLs.
}
export interface PortfolioApiErrorDto {
  statusCode: number;
  code: string;
  message: string; // Diagnostic fallback; translate by code, never by English message.
  errors?: { field: string; code: string; params?: { min?: number; max?: number } }[];
}
