import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Query,
  Req,
  Body,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiConflictResponse,
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
import { ListPhotosQueryDto } from './dto/list-photos-query.dto.js';
import { PhotoListResponseDto, PhotoResponseDto } from './dto/photo-response.dto.js';
import { UpdatePhotoDto } from './dto/update-photo.dto.js';
import {
  RequestPhotoUploadDto,
  RequestPhotoUploadResponseDto,
} from './dto/request-photo-upload.dto.js';
import { PhotosService } from './photos.service.js';

interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}

@ApiTags('photos')
@ApiBearerAuth()
@AdminOnly()
@Controller()
export class PhotosController {
  constructor(private readonly photosService: PhotosService) {}

  @Post('galleries/:galleryId/photos/upload-url')
  @ApiOperation({ summary: 'Create a direct-to-storage upload URL for a photo' })
  @ApiParam({ name: 'galleryId', format: 'uuid' })
  @ApiCreatedResponse({ type: RequestPhotoUploadResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid file metadata or photo is too large' })
  @ApiNotFoundResponse({ description: 'Gallery not found' })
  requestUpload(
    @Req() request: AuthenticatedRequest,
    @Param('galleryId', ParseUUIDPipe) galleryId: string,
    @Body() dto: RequestPhotoUploadDto,
  ) {
    return this.photosService.requestUpload(request.user.sub, galleryId, dto);
  }

  @Post('photos/:photoId/upload-complete')
  @ApiOperation({ summary: 'Confirm a direct upload and mark the photo for processing' })
  @ApiParam({ name: 'photoId', format: 'uuid' })
  @ApiOkResponse({ type: PhotoResponseDto })
  @ApiBadRequestResponse({ description: 'Uploaded object was not found' })
  @ApiConflictResponse({ description: 'Photo upload was already completed' })
  @ApiNotFoundResponse({ description: 'Photo not found' })
  completeUpload(
    @Req() request: AuthenticatedRequest,
    @Param('photoId', ParseUUIDPipe) photoId: string,
  ) {
    return this.photosService.completeUpload(request.user.sub, photoId);
  }

  @Get('galleries/:galleryId/photos')
  @ApiOperation({ summary: 'List active photos in an owned gallery' })
  @ApiParam({ name: 'galleryId', format: 'uuid' })
  @ApiOkResponse({ type: PhotoListResponseDto })
  @ApiNotFoundResponse({ description: 'Gallery not found' })
  findAll(
    @Req() request: AuthenticatedRequest,
    @Param('galleryId', ParseUUIDPipe) galleryId: string,
    @Query() query: ListPhotosQueryDto,
  ) {
    return this.photosService.findAll(request.user.sub, galleryId, query);
  }

  @Patch('photos/:photoId')
  @ApiOperation({ summary: 'Update a photo order within an owned gallery' })
  @ApiParam({ name: 'photoId', format: 'uuid' })
  @ApiOkResponse({ type: PhotoResponseDto })
  @ApiNotFoundResponse({ description: 'Photo not found' })
  update(
    @Req() request: AuthenticatedRequest,
    @Param('photoId', ParseUUIDPipe) photoId: string,
    @Body() dto: UpdatePhotoDto,
  ) {
    return this.photosService.update(request.user.sub, photoId, dto);
  }

  @Delete('photos/:photoId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a photo and its stored objects' })
  @ApiParam({ name: 'photoId', format: 'uuid' })
  @ApiNoContentResponse({ description: 'Photo deleted' })
  @ApiNotFoundResponse({ description: 'Photo not found' })
  async remove(
    @Req() request: AuthenticatedRequest,
    @Param('photoId', ParseUUIDPipe) photoId: string,
  ): Promise<void> {
    await this.photosService.remove(request.user.sub, photoId);
  }
}
