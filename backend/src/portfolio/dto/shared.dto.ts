import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNumber, Max, Min } from 'class-validator';
import { Integer, Text } from './fields.js';

export const PORTFOLIO_MAX_PHOTOS_PER_STORY = 10;
export const PORTFOLIO_MAX_UPLOAD_BYTES = 10_000_000;
export const PORTFOLIO_WEBP_WIDTHS = [480, 960, 1600] as const;
export const LOCALES = ['uk', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const PUBLICATION_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export const MEDIA_STATUSES = ['UPLOADING', 'PROCESSING', 'READY', 'FAILED', 'DELETED'] as const;
export const CONTACT_TYPES = ['instagram', 'telegram', 'email'] as const;

export class LocalizedTextDto {
  @Text(4000) uk!: string;
  @Text(4000) en!: string;
}
export class LocalizedTitleDto extends LocalizedTextDto {
  @Text(120) declare uk: string;
  @Text(120) declare en: string;
}
export class LocalizedSubtitleDto extends LocalizedTextDto {
  @Text(200) declare uk: string;
  @Text(200) declare en: string;
}
export class LocalizedSeoDescriptionDto extends LocalizedTextDto {
  @Text(320) declare uk: string;
  @Text(320) declare en: string;
}
export class LocalizedAltDto extends LocalizedTextDto {
  @Text(500) declare uk: string;
  @Text(500) declare en: string;
}

export class PortfolioPriceDto {
  @Integer(0, 100_000_000) amountMinor!: number;
  @ApiProperty({ enum: ['UAH'] }) @IsIn(['UAH']) currency!: 'UAH';
  @Integer(1, 1440) durationMinutes!: number;
}
export class FocalPointDto {
  @ApiProperty({ minimum: 0, maximum: 1 }) @IsNumber() @Min(0) @Max(1) x!: number;
  @ApiProperty({ minimum: 0, maximum: 1 }) @IsNumber() @Min(0) @Max(1) y!: number;
}
export class ImageVariantDto {
  @ApiProperty({
    description: 'Stable same-origin derivative route, never an original or storage key',
  })
  url!: string;
  @ApiProperty({ type: 'integer', minimum: 1 }) width!: number;
  @ApiProperty({ type: 'integer', minimum: 1 }) height!: number;
}
export class PortfolioImageDto extends ImageVariantDto {
  @ApiProperty({ format: 'uuid' }) mediaId!: string;
  @ApiProperty({ type: () => [ImageVariantDto] }) sources!: ImageVariantDto[];
  @ApiProperty() alt!: string;
  @ApiProperty({ type: () => FocalPointDto, nullable: true }) focalPoint!: FocalPointDto | null;
}
export class PortfolioSeoDto {
  @ApiProperty() title!: string;
  @ApiProperty() description!: string;
  @ApiProperty({ description: 'Server-derived locale-prefixed path' }) canonicalPath!: string;
  @ApiProperty({ type: () => PortfolioImageDto, nullable: true })
  shareImage!: PortfolioImageDto | null;
}
