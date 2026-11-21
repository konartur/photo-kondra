import { ApiProperty } from '@nestjs/swagger';
import {
  LOCALES,
  type Locale,
  PortfolioImageDto,
  PortfolioPriceDto,
  PortfolioSeoDto,
} from './shared.dto.js';

export class PortfolioContactDto {
  @ApiProperty({ enum: ['instagram', 'telegram', 'email'] }) type!:
    'instagram' | 'telegram' | 'email';
  @ApiProperty() label!: string;
  @ApiProperty({ description: 'Server-derived HTTPS profile or mailto address' }) href!: string;
}
export class PortfolioBookingServiceDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ type: () => PortfolioPriceDto, nullable: true }) price!: PortfolioPriceDto | null;
}
export class PortfolioBookingDto {
  @ApiProperty() intro!: string;
  @ApiProperty({ type: () => [PortfolioBookingServiceDto] })
  services!: PortfolioBookingServiceDto[];
}
export class PortfolioSiteDto {
  @ApiProperty() brand!: string;
  @ApiProperty({ enum: [...LOCALES] }) locale!: Locale;
  @ApiProperty({
    type: 'array',
    items: { type: 'string', enum: [...LOCALES] },
    minItems: 2,
    maxItems: 2,
    uniqueItems: true,
  })
  supportedLocales!: Locale[];
  @ApiProperty({ type: () => [PortfolioContactDto], maxItems: 3 }) contacts!: PortfolioContactDto[];
  @ApiProperty({ type: () => PortfolioBookingDto }) booking!: PortfolioBookingDto;
}
export class PortfolioServiceCardDto extends PortfolioBookingServiceDto {
  @ApiProperty() description!: string;
  @ApiProperty({ type: () => PortfolioImageDto }) cardImage!: PortfolioImageDto;
}
export class PortfolioStoryCardDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() title!: string;
  @ApiProperty() subtitle!: string;
  @ApiProperty({ type: () => PortfolioImageDto }) cover!: PortfolioImageDto;
}
export class FeaturedPortfolioStoryDto {
  @ApiProperty({ type: () => PortfolioStoryCardDto }) story!: PortfolioStoryCardDto;
  @ApiProperty() caption!: string;
}
export class PortfolioHeroDto {
  @ApiProperty({ type: () => PortfolioImageDto }) desktop!: PortfolioImageDto;
  @ApiProperty({ type: () => PortfolioImageDto }) mobile!: PortfolioImageDto;
}
export class PortfolioServicesSectionDto {
  @ApiProperty() title!: string;
  @ApiProperty() description!: string;
  @ApiProperty({ type: () => [PortfolioServiceCardDto], maxItems: 20 })
  items!: PortfolioServiceCardDto[];
}
export class PortfolioStoriesSectionDto {
  @ApiProperty() title!: string;
  @ApiProperty({ type: () => [FeaturedPortfolioStoryDto], maxItems: 12 })
  items!: FeaturedPortfolioStoryDto[];
}
export class PortfolioContactSectionDto {
  @ApiProperty() title!: string;
  @ApiProperty() description!: string;
  @ApiProperty() buttonLabel!: string;
  @ApiProperty({ type: () => PortfolioImageDto }) background!: PortfolioImageDto;
}
export class PortfolioHomeDto {
  @ApiProperty({ type: () => PortfolioHeroDto }) hero!: PortfolioHeroDto;
  @ApiProperty({ type: () => PortfolioServicesSectionDto })
  servicesSection!: PortfolioServicesSectionDto;
  @ApiProperty({ type: () => PortfolioStoriesSectionDto })
  storiesSection!: PortfolioStoriesSectionDto;
  @ApiProperty({ type: () => PortfolioContactSectionDto })
  contactSection!: PortfolioContactSectionDto;
  @ApiProperty({ type: () => PortfolioSeoDto }) seo!: PortfolioSeoDto;
}
export class PortfolioStoryCardPageDto {
  @ApiProperty({ type: () => [PortfolioStoryCardDto] }) items!: PortfolioStoryCardDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}
export class PortfolioServiceDto extends PortfolioServiceCardDto {
  @ApiProperty({ type: () => PortfolioSeoDto }) seo!: PortfolioSeoDto;
  @ApiProperty({ type: () => PortfolioStoryCardPageDto }) stories!: PortfolioStoryCardPageDto;
}
export class PortfolioStoryPhotoDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: () => PortfolioImageDto }) image!: PortfolioImageDto;
}
export class PortfolioStoryDto extends PortfolioStoryCardDto {
  @ApiProperty() description!: string;
  @ApiProperty({ type: () => PortfolioBookingServiceDto }) service!: PortfolioBookingServiceDto;
  @ApiProperty({ type: () => [PortfolioStoryPhotoDto], maxItems: 10 })
  photos!: PortfolioStoryPhotoDto[];
  @ApiProperty({ type: () => PortfolioStoryCardDto, nullable: true })
  nextStory!: PortfolioStoryCardDto | null;
  @ApiProperty({ type: () => PortfolioSeoDto }) seo!: PortfolioSeoDto;
}
export class PortfolioSiteResponseDto {
  @ApiProperty({ type: () => PortfolioSiteDto }) data!: PortfolioSiteDto;
  @ApiProperty({ type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER })
  contentVersion!: number;
}
export class PortfolioPageBaseDto {
  @ApiProperty({ type: () => PortfolioSiteDto }) site!: PortfolioSiteDto;
  @ApiProperty({ type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER })
  contentVersion!: number;
}
export class PortfolioHomePageDto extends PortfolioPageBaseDto {
  @ApiProperty({ type: () => PortfolioHomeDto }) page!: PortfolioHomeDto;
}
export class PortfolioServicePageDto extends PortfolioPageBaseDto {
  @ApiProperty({ type: () => PortfolioServiceDto }) page!: PortfolioServiceDto;
}
export class PortfolioStoryPageDto extends PortfolioPageBaseDto {
  @ApiProperty({ type: () => PortfolioStoryDto }) page!: PortfolioStoryDto;
}
export class PortfolioServiceListDto {
  @ApiProperty({ type: () => [PortfolioServiceCardDto] }) items!: PortfolioServiceCardDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
  @ApiProperty({ enum: [...LOCALES] }) locale!: Locale;
  @ApiProperty({ type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER })
  contentVersion!: number;
}
export class PortfolioSitemapAlternateDto {
  @ApiProperty({ enum: [...LOCALES] }) locale!: Locale;
  @ApiProperty() path!: string;
}
export class PortfolioSitemapItemDto extends PortfolioSitemapAlternateDto {
  @ApiProperty({ type: () => [PortfolioSitemapAlternateDto] })
  alternates!: PortfolioSitemapAlternateDto[];
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: string;
}
export class PortfolioSitemapDto {
  @ApiProperty({ type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER })
  contentVersion!: number;
  @ApiProperty({ type: () => [PortfolioSitemapItemDto] }) items!: PortfolioSitemapItemDto[];
}
