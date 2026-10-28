import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArchiveStatus } from '@prisma/client';
import { IsString, Length } from 'class-validator';

export class ArchiveAccessQueryDto {
  @ApiProperty({ description: 'Private gallery access token' })
  @IsString()
  @Length(1, 256)
  token!: string;
}

export class PublicArchiveResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty({ enum: ArchiveStatus })
  status!: ArchiveStatus;
  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  expiresAt!: Date | null;
  @ApiPropertyOptional({ description: 'Short-lived signed URL, only for READY archives' })
  downloadUrl?: string;
  @ApiPropertyOptional({ description: 'Signed URL lifetime in seconds' })
  expiresIn?: number;
}
