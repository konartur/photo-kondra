import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsString,
  IsUUID,
  Matches,
  Validate,
  ValidateNested,
  IsOptional,
  IsObject,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { isEmail } from 'class-validator';
import { Integer, Nested, NestedList, Text } from './fields.js';
import {
  CONTACT_TYPES,
  FocalPointDto,
  LocalizedAltDto,
  LocalizedSeoDescriptionDto,
  LocalizedSubtitleDto,
  LocalizedTextDto,
  LocalizedTitleDto,
  PortfolioPriceDto,
  PORTFOLIO_MAX_UPLOAD_BYTES,
} from './shared.dto.js';

@ValidatorConstraint({ name: 'portfolioContactAddress', async: false })
class PortfolioContactAddress implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    if (typeof value !== 'string') return false;
    const { type } = args.object as PortfolioContactInputDto;
    if (type === 'email') return isEmail(value);
    try {
      const url = new URL(value);
      const hosts =
        type === 'instagram'
          ? ['instagram.com', 'www.instagram.com']
          : type === 'telegram'
            ? ['t.me', 'telegram.me']
            : [];
      return (
        url.protocol === 'https:' &&
        hosts.includes(url.hostname) &&
        !url.username &&
        !url.password &&
        !url.port &&
        !url.search &&
        !url.hash &&
        /^\/[A-Za-z0-9_.]+\/?$/.test(url.pathname)
      );
    } catch {
      return false;
    }
  }
  defaultMessage() {
    return 'address must be an allowed HTTPS channel profile or email';
  }
}

export class PortfolioImageRefDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() mediaId!: string;
  @Nested(LocalizedAltDto) alt!: LocalizedAltDto;
  @Nested(FocalPointDto, true) focalPoint!: FocalPointDto | null;
}
export class PortfolioSeoInputDto {
  @Nested(LocalizedTitleDto) title!: LocalizedTitleDto;
  @Nested(LocalizedSeoDescriptionDto) description!: LocalizedSeoDescriptionDto;
  @Nested(PortfolioImageRefDto, true) shareImage!: PortfolioImageRefDto | null;
}
export class PortfolioContactInputDto {
  @ApiProperty({ enum: [...CONTACT_TYPES] })
  @IsIn(CONTACT_TYPES)
  type!: (typeof CONTACT_TYPES)[number];
  @Nested(LocalizedTitleDto) label!: LocalizedTitleDto;
  @Text(2048) @Validate(PortfolioContactAddress) address!: string;
  @ApiProperty() @IsBoolean() visible!: boolean;
}
export class PortfolioServiceDraftInputDto {
  @ApiProperty({ minLength: 1, pattern: '^[a-z0-9]+(-[a-z0-9]+)*$' })
  @Text(80)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug!: string;
  @Nested(LocalizedTitleDto) title!: LocalizedTitleDto;
  @Nested(LocalizedTextDto) description!: LocalizedTextDto;
  @Nested(PortfolioPriceDto, true) price!: PortfolioPriceDto | null;
  @Nested(PortfolioImageRefDto, true) cardImage!: PortfolioImageRefDto | null;
  @ApiProperty() @IsBoolean() bookingEnabled!: boolean;
  @Nested(PortfolioSeoInputDto) seo!: PortfolioSeoInputDto;
}
export class PortfolioStoryDraftInputDto {
  @ApiProperty({ minLength: 1, pattern: '^[a-z0-9]+(-[a-z0-9]+)*$' })
  @Text(80)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug!: string;
  @Nested(LocalizedTitleDto) title!: LocalizedTitleDto;
  @Nested(LocalizedSubtitleDto) subtitle!: LocalizedSubtitleDto;
  @Nested(LocalizedTextDto) description!: LocalizedTextDto;
  @ApiProperty({ format: 'uuid' }) @IsUUID() serviceId!: string;
  @Nested(PortfolioImageRefDto, true) cover!: PortfolioImageRefDto | null;
  @Nested(PortfolioSeoInputDto) seo!: PortfolioSeoInputDto;
}
export class PortfolioHeroInputDto {
  @Nested(PortfolioImageRefDto, true) desktop!: PortfolioImageRefDto | null;
  @Nested(PortfolioImageRefDto, true) mobile!: PortfolioImageRefDto | null;
}
export class PortfolioServicesSectionInputDto {
  @Nested(LocalizedTitleDto) title!: LocalizedTitleDto;
  @Nested(LocalizedTextDto) description!: LocalizedTextDto;
  @ApiProperty({ type: [String], format: 'uuid', maxItems: 20, uniqueItems: true })
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  serviceIds!: string[];
}
export class PortfolioFeaturedStoryInputDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() storyId!: string;
  @Nested(LocalizedTextDto) caption!: LocalizedTextDto;
  @ApiPropertyOptional({ type: () => PortfolioImageRefDto, nullable: true })
  @IsOptional() @IsObject() @ValidateNested() @Type(() => PortfolioImageRefDto)
  image?: PortfolioImageRefDto | null;
}
export class PortfolioStoriesSectionInputDto {
  @Nested(LocalizedTitleDto) title!: LocalizedTitleDto;
  @NestedList(PortfolioFeaturedStoryInputDto, 12)
  @ArrayUnique((item: PortfolioFeaturedStoryInputDto) => item?.storyId)
  items!: PortfolioFeaturedStoryInputDto[];
}
export class PortfolioContactSectionInputDto {
  @Nested(LocalizedTitleDto) title!: LocalizedTitleDto;
  @Nested(LocalizedTextDto) description!: LocalizedTextDto;
  @Nested(LocalizedTitleDto) buttonLabel!: LocalizedTitleDto;
  @Nested(PortfolioImageRefDto, true) background!: PortfolioImageRefDto | null;
}
export class PortfolioHomeDraftInputDto {
  @Text(120) brand!: string;
  @NestedList(PortfolioContactInputDto, 3)
  @ArrayUnique((item: PortfolioContactInputDto) => item?.type)
  contacts!: PortfolioContactInputDto[];
  @Nested(LocalizedTextDto) bookingIntro!: LocalizedTextDto;
  @Nested(PortfolioHeroInputDto) hero!: PortfolioHeroInputDto;
  @Nested(PortfolioServicesSectionInputDto) servicesSection!: PortfolioServicesSectionInputDto;
  @Nested(PortfolioStoriesSectionInputDto) storiesSection!: PortfolioStoriesSectionInputDto;
  @Nested(PortfolioContactSectionInputDto) contactSection!: PortfolioContactSectionInputDto;
  @Nested(PortfolioSeoInputDto) seo!: PortfolioSeoInputDto;
}
export class PublicationCommandDto {
  @Integer(1) expectedVersion!: number;
}
export class PortfolioServiceDraftUpdateDto extends PublicationCommandDto {
  @Nested(PortfolioServiceDraftInputDto) data!: PortfolioServiceDraftInputDto;
}
export class PortfolioStoryDraftUpdateDto extends PublicationCommandDto {
  @Nested(PortfolioStoryDraftInputDto) data!: PortfolioStoryDraftInputDto;
}
export class PortfolioHomeDraftUpdateDto extends PublicationCommandDto {
  @Nested(PortfolioHomeDraftInputDto) data!: PortfolioHomeDraftInputDto;
}
export class PortfolioStoryPhotoInputDto {
  @ApiProperty({ format: 'uuid', description: 'Client-generated stable placement ID' })
  @IsUUID()
  id!: string;
  @Nested(PortfolioImageRefDto) image!: PortfolioImageRefDto;
}
export class ReplaceStoryPhotosDto extends PublicationCommandDto {
  @ApiProperty({
    description:
      'Unique placement IDs and media IDs; cover + items union must contain at most 10 media IDs. Checked atomically against the stored cover in the draft service.',
    minItems: 1,
  })
  @NestedList(PortfolioStoryPhotoInputDto, 10)
  @ArrayMinSize(1)
  @ArrayUnique((item: PortfolioStoryPhotoInputDto) => item?.id)
  @ArrayUnique((item: PortfolioStoryPhotoInputDto) => item?.image?.mediaId)
  items!: PortfolioStoryPhotoInputDto[];
}
export class RequestPortfolioUploadDto {
  @ApiProperty({ minLength: 1, pattern: '^[^\\u0000-\\u001f\\u007f/\\\\]+$' })
  // Reject control characters as well as path separators in original filenames.
  @Text(255)
  // eslint-disable-next-line no-control-regex
  @Matches(/^[^\x00-\x1f\x7f/\\]+$/)
  filename!: string;
  @ApiProperty({ enum: ['image/jpeg', 'image/png', 'image/webp'] })
  @IsString()
  @IsIn(['image/jpeg', 'image/png', 'image/webp'])
  mimeType!: 'image/jpeg' | 'image/png' | 'image/webp';
  @Integer(1, PORTFOLIO_MAX_UPLOAD_BYTES) sizeBytes!: number;
}

/** Shared domain precondition for cover updates, photo replacement and publication.
 * Call under the story version transaction in PF-CONTENT-04/05. DTO validation alone
 * cannot see the existing cover when replacing photos.
 */
export function storyPhotoLimitSatisfied(
  coverMediaId: string | null,
  photoMediaIds: readonly string[],
): boolean {
  return new Set([...photoMediaIds, ...(coverMediaId ? [coverMediaId] : [])]).size <= 10;
}
