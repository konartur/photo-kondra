import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { ListPhotosQueryDto } from '../photos/dto/list-photos-query.dto.js';
import {
  PublicGalleryResponseDto,
  PublicPhotoListResponseDto,
} from './dto/public-gallery-response.dto.js';
import { PublicGalleryService } from './public-gallery.service.js';

@ApiTags('public galleries')
@Controller('public/galleries')
export class PublicGalleryController {
  constructor(private readonly publicGalleryService: PublicGalleryService) {}

  @Get(':token')
  @ApiOperation({ summary: 'Get a private gallery using its access token' })
  @ApiParam({ name: 'token', description: 'Private gallery access token' })
  @ApiOkResponse({ type: PublicGalleryResponseDto })
  @ApiNotFoundResponse({ description: 'Gallery was not found or the access token is invalid' })
  getGallery(@Param('token') token: string) {
    return this.publicGalleryService.getGallery(token);
  }

  @Get(':token/photos')
  @ApiOperation({ summary: 'List READY photos in a private gallery' })
  @ApiParam({ name: 'token', description: 'Private gallery access token' })
  @ApiOkResponse({ type: PublicPhotoListResponseDto })
  @ApiNotFoundResponse({ description: 'Gallery was not found or the access token is invalid' })
  getPhotos(@Param('token') token: string, @Query() query: ListPhotosQueryDto) {
    return this.publicGalleryService.getPhotos(token, query);
  }
}
