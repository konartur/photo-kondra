import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { JwtPayload } from '../auth/auth.types.js';
import { AdminOnly } from '../auth/roles.decorator.js';
import { CreateGalleryAccessDto } from './dto/create-gallery-access.dto.js';
import {
  CreatedGalleryAccessResponseDto,
  GalleryAccessResponseDto,
} from './dto/gallery-access-response.dto.js';
import { GalleryAccessService } from './gallery-access.service.js';

interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}

@ApiTags('gallery access')
@ApiBearerAuth()
@AdminOnly()
@Controller()
export class GalleryAccessController {
  constructor(private readonly galleryAccessService: GalleryAccessService) {}

  @Post('galleries/:galleryId/access-links')
  @ApiOperation({ summary: 'Create a private gallery access link' })
  @ApiParam({ name: 'galleryId', format: 'uuid' })
  @ApiCreatedResponse({ type: CreatedGalleryAccessResponseDto })
  @ApiNotFoundResponse({ description: 'Gallery not found' })
  create(
    @Req() request: AuthenticatedRequest,
    @Param('galleryId', ParseUUIDPipe) galleryId: string,
    @Body() dto: CreateGalleryAccessDto,
  ) {
    return this.galleryAccessService.create(request.user.sub, galleryId, dto);
  }

  @Get('galleries/:galleryId/access-links')
  @ApiOperation({ summary: 'List private gallery access links' })
  @ApiParam({ name: 'galleryId', format: 'uuid' })
  @ApiOkResponse({ type: [GalleryAccessResponseDto] })
  @ApiNotFoundResponse({ description: 'Gallery not found' })
  findAll(
    @Req() request: AuthenticatedRequest,
    @Param('galleryId', ParseUUIDPipe) galleryId: string,
  ) {
    return this.galleryAccessService.findAll(request.user.sub, galleryId);
  }

  @Delete('access-links/:accessLinkId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Revoke a private gallery access link' })
  @ApiParam({ name: 'accessLinkId', format: 'uuid' })
  @ApiNoContentResponse({ description: 'Access link revoked' })
  @ApiNotFoundResponse({ description: 'Gallery access link not found' })
  async revoke(
    @Req() request: AuthenticatedRequest,
    @Param('accessLinkId', ParseUUIDPipe) accessLinkId: string,
  ): Promise<void> {
    await this.galleryAccessService.revoke(request.user.sub, accessLinkId);
  }
}
