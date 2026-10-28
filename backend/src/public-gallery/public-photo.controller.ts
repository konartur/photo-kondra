import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { PublicPhotoDownloadResponseDto } from './dto/public-gallery-response.dto.js';
import { PublicGalleryService } from './public-gallery.service.js';

@ApiTags('public galleries')
@Controller('public/photos')
export class PublicPhotoController {
  constructor(private readonly publicGalleryService: PublicGalleryService) {}

  @Get(':token/:photoId/download')
  @ApiOperation({ summary: 'Create a short-lived download URL for an original gallery photo' })
  @ApiParam({ name: 'token', description: 'Private gallery access token' })
  @ApiParam({ name: 'photoId', format: 'uuid' })
  @ApiOkResponse({ type: PublicPhotoDownloadResponseDto })
  @ApiNotFoundResponse({ description: 'Gallery, token, or photo was not found' })
  createDownloadUrl(
    @Param('token') token: string,
    @Param('photoId', ParseUUIDPipe) photoId: string,
  ) {
    return this.publicGalleryService.createPhotoDownloadUrl(token, photoId);
  }
}
