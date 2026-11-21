import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { LOCALES, type Locale } from './shared.dto.js';

export class PortfolioLocaleQueryDto {
  @ApiPropertyOptional({ enum: [...LOCALES], default: 'en' })
  @IsIn(LOCALES)
  locale: Locale = 'en';
}
export class PortfolioListQueryDto {
  @ApiPropertyOptional({ type: 'integer', default: 24, minimum: 1, maximum: 50 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 24;

  @ApiPropertyOptional({ description: 'Opaque version/context-bound cursor', maxLength: 2048 })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(2048)
  cursor?: string;
}
export class PortfolioPublicListQueryDto extends PortfolioListQueryDto {
  @ApiPropertyOptional({ enum: [...LOCALES], default: 'en' })
  @IsIn(LOCALES)
  locale: Locale = 'en';
}
