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

export class PortfolioMediaListQueryDto extends PortfolioListQueryDto {
  @ApiPropertyOptional({
    description: 'Case-insensitive filename substring; cursor is bound to the trimmed search',
    maxLength: 120,
  })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(120)
  search?: string;
}

export class PortfolioAdminListQueryDto extends PortfolioListQueryDto {
  @ApiPropertyOptional({ description: 'Case-insensitive title or slug substring', maxLength: 120 })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(120)
  search?: string;
  @ApiPropertyOptional({ enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'] })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(['DRAFT', 'PUBLISHED', 'ARCHIVED'])
  status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
}
