import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiConflictResponse,
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
import { CreateGalleryDto } from './dto/create-gallery.dto.js';
import { UpdateGalleryDto } from './dto/update-gallery.dto.js';
import { UpdateGalleryStatusDto } from './dto/update-gallery-status.dto.js';
import { GalleriesService } from './galleries.service.js';

interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}

@ApiTags('galleries')
@ApiBearerAuth()
@AdminOnly()
@Controller('galleries')
export class GalleriesController {
  constructor(private readonly galleriesService: GalleriesService) {}

  @Get()
  @ApiOperation({ summary: 'List galleries owned by the current administrator' })
  @ApiOkResponse({ description: 'Gallery list' })
  findAll(@Req() request: AuthenticatedRequest) {
    return this.galleriesService.findAll(request.user.sub);
  }

  @Post()
  @ApiOperation({ summary: 'Create a gallery' })
  @ApiCreatedResponse({ description: 'Gallery created' })
  create(@Req() request: AuthenticatedRequest, @Body() dto: CreateGalleryDto) {
    return this.galleriesService.create(request.user.sub, dto);
  }

  @Get(':galleryId')
  @ApiOperation({ summary: 'Get a gallery owned by the current administrator' })
  @ApiParam({ name: 'galleryId', format: 'uuid' })
  @ApiOkResponse({ description: 'Gallery details' })
  @ApiNotFoundResponse({ description: 'Gallery not found' })
  findOne(@Req() request: AuthenticatedRequest, @Param('galleryId') galleryId: string) {
    return this.galleriesService.findOne(request.user.sub, galleryId);
  }

  @Patch(':galleryId')
  @ApiOperation({ summary: 'Update a gallery owned by the current administrator' })
  @ApiParam({ name: 'galleryId', format: 'uuid' })
  @ApiOkResponse({ description: 'Gallery updated' })
  @ApiNotFoundResponse({ description: 'Gallery not found' })
  update(
    @Req() request: AuthenticatedRequest,
    @Param('galleryId') galleryId: string,
    @Body() dto: UpdateGalleryDto,
  ) {
    return this.galleriesService.update(request.user.sub, galleryId, dto);
  }

  @Patch(':galleryId/status')
  @ApiOperation({ summary: 'Transition a gallery through its allowed lifecycle' })
  @ApiParam({ name: 'galleryId', format: 'uuid' })
  @ApiOkResponse({ description: 'Gallery status updated' })
  @ApiNotFoundResponse({ description: 'Gallery not found' })
  @ApiConflictResponse({ description: 'Status transition is not allowed' })
  transitionStatus(
    @Req() request: AuthenticatedRequest,
    @Param('galleryId') galleryId: string,
    @Body() dto: UpdateGalleryStatusDto,
  ) {
    return this.galleriesService.transitionStatus(request.user.sub, galleryId, dto.status);
  }

  @Delete(':galleryId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a gallery owned by the current administrator' })
  @ApiParam({ name: 'galleryId', format: 'uuid' })
  @ApiNoContentResponse({ description: 'Gallery deleted' })
  @ApiNotFoundResponse({ description: 'Gallery not found' })
  async remove(
    @Req() request: AuthenticatedRequest,
    @Param('galleryId') galleryId: string,
  ): Promise<void> {
    await this.galleriesService.remove(request.user.sub, galleryId);
  }
}
