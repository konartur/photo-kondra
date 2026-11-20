/** Design reference only. No runtime endpoint accepts these fields yet. */
export type Locale = 'uk' | 'en';
export interface LocalizedTextDto { uk: string; en: string }
export interface LocaleQueryDto { locale: Locale }

export interface GalleryTranslationsInputDto {
  title: LocalizedTextDto; // Trim; 1..120 per locale, both required.
  description: LocalizedTextDto | null; // null = absent; otherwise 1..1000 each.
}
export interface CreateLocalizedGalleryDto {
  translations: GalleryTranslationsInputDto;
}
export interface UpdateLocalizedGalleryDto {
  // Omitted = unchanged. Full pair replaces translations atomically; null forbidden.
  translations?: GalleryTranslationsInputDto;
}
export interface AdminGalleryLocalizationDto {
  // Extension to existing admin response, not a replacement for id/status/etc.
  translations: GalleryTranslationsInputDto;
  translationReviewRequired: boolean; // Server-derived legacy migration marker.
}
export interface PublicGalleryLocalizationDto {
  // Extension to existing public response. No admin-only translation marker.
  locale: Locale;
  title: string;
  description: string | null;
}
export interface LocalizedApiErrorDto {
  statusCode: number;
  code: string; // Stable machine code; frontend maps to dictionary key.
  message: string; // Safe diagnostic fallback, not a translation lookup key.
  // Optional structured validation details; no raw values/tokens/DB errors.
  errors?: { field: string; code: string; params?: { min?: number; max?: number } }[];
}
