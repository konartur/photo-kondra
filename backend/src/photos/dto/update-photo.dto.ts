import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class UpdatePhotoDto {
  @ApiProperty({ example: 0, minimum: 0, description: 'Zero-based position inside the gallery' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder!: number;
}
