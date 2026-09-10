import { PartialType } from '@nestjs/swagger';
import { CreateGalleryDto } from './create-gallery.dto.js';

export class UpdateGalleryDto extends PartialType(CreateGalleryDto) {}
