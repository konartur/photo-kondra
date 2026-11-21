import { ApiProperty } from '@nestjs/swagger';
import { ApiErrorDto } from '../../common/api-error.dto.js';
import {
  PortfolioHomeDraftInputDto,
  PortfolioServiceDraftInputDto,
  PortfolioStoryDraftInputDto,
  PortfolioStoryPhotoInputDto,
} from './admin-input.dto.js';
import { LocalizedTitleDto, MEDIA_STATUSES, PUBLICATION_STATUSES } from './shared.dto.js';
import {
  PortfolioHomeDto,
  PortfolioServiceDto,
  PortfolioSiteDto,
  PortfolioStoryDto,
} from './public.dto.js';

export class AdminPortfolioEntityBaseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: [...PUBLICATION_STATUSES] }) status!: (typeof PUBLICATION_STATUSES)[number];
  @ApiProperty({ type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER })
  draftVersion!: number;
  @ApiProperty({ type: 'integer', nullable: true, minimum: 1, maximum: Number.MAX_SAFE_INTEGER })
  publishedVersion!: number | null;
  @ApiProperty() hasUnpublishedChanges!: boolean;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) publishedAt!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: string;
}
export class AdminPortfolioServiceDto extends AdminPortfolioEntityBaseDto {
  @ApiProperty({ type: () => PortfolioServiceDraftInputDto }) draft!: PortfolioServiceDraftInputDto;
}
export class AdminPortfolioStoryDto extends AdminPortfolioEntityBaseDto {
  @ApiProperty({ type: () => PortfolioStoryDraftInputDto }) draft!: PortfolioStoryDraftInputDto;
  @ApiProperty({ type: () => [PortfolioStoryPhotoInputDto], maxItems: 10 })
  photos!: PortfolioStoryPhotoInputDto[];
}
export class AdminPortfolioSettingsDto extends AdminPortfolioEntityBaseDto {
  @ApiProperty({ type: () => PortfolioHomeDraftInputDto }) draft!: PortfolioHomeDraftInputDto;
}
export class AdminPortfolioSummaryDto extends AdminPortfolioEntityBaseDto {
  @ApiProperty() slug!: string;
  @ApiProperty({ type: () => LocalizedTitleDto }) title!: LocalizedTitleDto;
}
export class AdminPortfolioServiceListDto {
  @ApiProperty({ type: () => [AdminPortfolioSummaryDto] }) items!: AdminPortfolioSummaryDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}
export class AdminPortfolioStoryListDto extends AdminPortfolioServiceListDto {}
export class AdminPortfolioMediaDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() filename!: string;
  @ApiProperty() mimeType!: string;
  @ApiProperty({
    type: String,
    pattern: '^\\d+$',
    description: 'BigInt serialized as decimal bytes',
  })
  sizeBytes!: string;
  @ApiProperty({ type: 'integer', minimum: 1, nullable: true }) width!: number | null;
  @ApiProperty({ type: 'integer', minimum: 1, nullable: true }) height!: number | null;
  @ApiProperty({ enum: [...MEDIA_STATUSES] }) status!: (typeof MEDIA_STATUSES)[number];
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Authenticated media route; never public draft access',
  })
  previewUrl!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
}
export class AdminPortfolioMediaListDto {
  @ApiProperty({ type: () => [AdminPortfolioMediaDto] }) items!: AdminPortfolioMediaDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}
export class PortfolioUploadHeadersDto {
  @ApiProperty() 'Content-Type'!: string;
  @ApiProperty({ enum: ['*'] }) 'If-None-Match'!: '*';
}
export class PortfolioUploadResponseDto {
  @ApiProperty({ format: 'uuid' }) mediaId!: string;
  @ApiProperty() uploadUrl!: string;
  @ApiProperty({ type: 'integer', minimum: 1 }) expiresIn!: number;
  @ApiProperty({ type: () => PortfolioUploadHeadersDto })
  requiredHeaders!: PortfolioUploadHeadersDto;
}
export class PortfolioPublicationResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: [...PUBLICATION_STATUSES] }) status!: (typeof PUBLICATION_STATUSES)[number];
  @ApiProperty({ type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER })
  draftVersion!: number;
  @ApiProperty({ type: 'integer', nullable: true, minimum: 1, maximum: Number.MAX_SAFE_INTEGER })
  publishedVersion!: number | null;
  @ApiProperty({ type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER })
  contentVersion!: number;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) publishedAt!: string | null;
}
export class PortfolioPreviewBaseDto {
  @ApiProperty({ type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER })
  draftVersion!: number;
  @ApiProperty({ type: () => PortfolioSiteDto }) site!: PortfolioSiteDto;
}
export class PortfolioHomePreviewDto extends PortfolioPreviewBaseDto {
  @ApiProperty({ type: () => PortfolioHomeDto }) page!: PortfolioHomeDto;
}
export class PortfolioServicePreviewDto extends PortfolioPreviewBaseDto {
  @ApiProperty({ type: () => PortfolioServiceDto }) page!: PortfolioServiceDto;
}
export class PortfolioStoryPreviewDto extends PortfolioPreviewBaseDto {
  @ApiProperty({ type: () => PortfolioStoryDto }) page!: PortfolioStoryDto;
}
export class PortfolioValidationParamsDto {
  @ApiProperty({ required: false }) min?: number;
  @ApiProperty({ required: false }) max?: number;
}
export class PortfolioValidationErrorDto {
  @ApiProperty() field!: string;
  @ApiProperty() code!: string;
  @ApiProperty({ type: () => PortfolioValidationParamsDto, required: false })
  params?: PortfolioValidationParamsDto;
}
/** Same error envelope as the application; optional field details are additive. */
export class PortfolioApiErrorDto extends ApiErrorDto {
  @ApiProperty({
    description:
      'Stable error code: VALIDATION_FAILED (400); UNAUTHORIZED/FORBIDDEN (401/403); PORTFOLIO_CONTENT_NOT_FOUND (404); PORTFOLIO_VERSION_CONFLICT, PORTFOLIO_NOT_READY, PORTFOLIO_CONTENT_REFERENCED, PORTFOLIO_SLUG_IMMUTABLE, PORTFOLIO_SLUG_TAKEN, PORTFOLIO_CURSOR_STALE (409); PORTFOLIO_UNAVAILABLE (503). Error mapping is implemented alongside the corresponding endpoints.',
  })
  declare code: string;
  @ApiProperty({ required: false, type: () => [PortfolioValidationErrorDto] })
  errors?: PortfolioValidationErrorDto[];
}
