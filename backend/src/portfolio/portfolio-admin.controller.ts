import {
  Body, Controller, Delete, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Req,
} from '@nestjs/common';
import {
  ApiBadRequestResponse, ApiBearerAuth, ApiConflictResponse, ApiCreatedResponse,
  ApiNoContentResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation,
  ApiParam, ApiTags, ApiUnauthorizedResponse, ApiForbiddenResponse, ApiServiceUnavailableResponse,
} from '@nestjs/swagger';
import { PortfolioEntityType } from '@prisma/client';
import type { Request } from 'express';
import type { JwtPayload } from '../auth/auth.types.js';
import { AdminOnly } from '../auth/roles.decorator.js';
import {
  PortfolioHomeDraftUpdateDto, PortfolioServiceDraftInputDto, PortfolioServiceDraftUpdateDto,
  PublicationCommandDto,
  PortfolioStoryDraftInputDto, PortfolioStoryDraftUpdateDto, ReplaceStoryPhotosDto,
} from './dto/admin-input.dto.js';
import {
  AdminPortfolioServiceDto, AdminPortfolioServiceListDto, AdminPortfolioStoryDto,
  AdminPortfolioStoryListDto, AdminPortfolioSettingsDto, PortfolioPublicationResponseDto,
  PortfolioServicePreviewDto, PortfolioStoryPreviewDto, PortfolioHomePreviewDto,
} from './dto/admin-response.dto.js';
import { PortfolioListQueryDto, PortfolioLocaleQueryDto } from './dto/query.dto.js';
import { PortfolioAdminService } from './portfolio-admin.service.js';
import { PortfolioPublicationService } from './portfolio-publication.service.js';

interface AdminRequest extends Request { user: JwtPayload; }

@ApiTags('portfolio admin drafts')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Authentication required' })
@ApiForbiddenResponse({ description: 'ADMIN role required' })
@ApiBadRequestResponse({ description: 'VALIDATION_FAILED: invalid DTO, UUID or pagination' })
@ApiNotFoundResponse({ description: 'PORTFOLIO_CONTENT_NOT_FOUND: entity or reference not found' })
@ApiConflictResponse({ description: 'PORTFOLIO_VERSION_CONFLICT, PORTFOLIO_NOT_READY, PORTFOLIO_SLUG_IMMUTABLE, PORTFOLIO_CONTENT_REFERENCED or PORTFOLIO_CURSOR_STALE' })
@ApiServiceUnavailableResponse({ description: 'Database or active publication snapshot unavailable' })
@AdminOnly()
@Controller('portfolio')
export class PortfolioAdminController {
  constructor(private readonly admin: PortfolioAdminService, private readonly publication: PortfolioPublicationService) {}

  @Get('services') @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: AdminPortfolioServiceListDto })
  listServices(@Query() query: PortfolioListQueryDto) { return this.admin.listServices(query); }

  @Post('services') @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Create an incomplete or complete bilingual service draft' })
  @ApiCreatedResponse({ type: AdminPortfolioServiceDto })
  createService(@Req() req: AdminRequest, @Body() dto: PortfolioServiceDraftInputDto) { return this.admin.createService(req.user.sub, dto); }

  @Get('services/:id') @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'id', format: 'uuid' }) @ApiOkResponse({ type: AdminPortfolioServiceDto })
  getService(@Param('id', ParseUUIDPipe) id: string) { return this.admin.getService(id); }

  @Put('services/:id') @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'id', format: 'uuid' }) @ApiOkResponse({ type: AdminPortfolioServiceDto })
  updateService(@Req() req: AdminRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PortfolioServiceDraftUpdateDto) { return this.admin.updateService(req.user.sub, id, dto.expectedVersion, dto.data); }

  @Delete('services/:id') @Header('Cache-Control', 'no-store') @HttpCode(204)
  @ApiParam({ name: 'id', format: 'uuid' }) @ApiNoContentResponse({ description: 'Deleted an unpublished, unreferenced service draft' })
  removeService(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PublicationCommandDto) { return this.admin.removeService(id, dto.expectedVersion); }

  @Post('services/:id/publish') @HttpCode(200) @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'id', format: 'uuid' }) @ApiOkResponse({ type: PortfolioPublicationResponseDto })
  publishService(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PublicationCommandDto) { return this.publication.publish(PortfolioEntityType.SERVICE, id, dto.expectedVersion); }

  @Post('services/:id/archive') @HttpCode(200) @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'id', format: 'uuid' }) @ApiOkResponse({ type: PortfolioPublicationResponseDto })
  archiveService(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PublicationCommandDto) { return this.publication.archive(PortfolioEntityType.SERVICE, id, dto.expectedVersion); }

  @Get('services/:id/preview') @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'id', format: 'uuid' }) @ApiOkResponse({ type: PortfolioServicePreviewDto })
  previewService(@Param('id', ParseUUIDPipe) id: string, @Query() query: PortfolioLocaleQueryDto) { return this.publication.preview(PortfolioEntityType.SERVICE, id, query); }

  @Get('stories') @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: AdminPortfolioStoryListDto })
  listStories(@Query() query: PortfolioListQueryDto) { return this.admin.listStories(query); }

  @Post('stories') @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Create an incomplete or complete bilingual story draft' })
  @ApiCreatedResponse({ type: AdminPortfolioStoryDto })
  createStory(@Req() req: AdminRequest, @Body() dto: PortfolioStoryDraftInputDto) { return this.admin.createStory(req.user.sub, dto); }

  @Get('stories/:id') @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'id', format: 'uuid' }) @ApiOkResponse({ type: AdminPortfolioStoryDto })
  getStory(@Param('id', ParseUUIDPipe) id: string) { return this.admin.getStory(id); }

  @Put('stories/:id') @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'id', format: 'uuid' }) @ApiOkResponse({ type: AdminPortfolioStoryDto })
  updateStory(@Req() req: AdminRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PortfolioStoryDraftUpdateDto) { return this.admin.updateStory(req.user.sub, id, dto.expectedVersion, dto.data); }

  @Put('stories/:id/photos') @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'id', format: 'uuid' }) @ApiOkResponse({ type: AdminPortfolioStoryDto })
  replacePhotos(@Req() req: AdminRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReplaceStoryPhotosDto) { return this.admin.replacePhotos(req.user.sub, id, dto.expectedVersion, dto.items); }

  @Delete('stories/:id') @Header('Cache-Control', 'no-store') @HttpCode(204)
  @ApiParam({ name: 'id', format: 'uuid' }) @ApiNoContentResponse({ description: 'Deleted an unpublished, unreferenced story draft' })
  removeStory(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PublicationCommandDto) { return this.admin.removeStory(id, dto.expectedVersion); }

  @Post('stories/:id/publish') @HttpCode(200) @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'id', format: 'uuid' }) @ApiOkResponse({ type: PortfolioPublicationResponseDto })
  publishStory(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PublicationCommandDto) { return this.publication.publish(PortfolioEntityType.STORY, id, dto.expectedVersion); }

  @Post('stories/:id/archive') @HttpCode(200) @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'id', format: 'uuid' }) @ApiOkResponse({ type: PortfolioPublicationResponseDto })
  archiveStory(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PublicationCommandDto) { return this.publication.archive(PortfolioEntityType.STORY, id, dto.expectedVersion); }

  @Get('stories/:id/preview') @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'id', format: 'uuid' }) @ApiOkResponse({ type: PortfolioStoryPreviewDto })
  previewStory(@Param('id', ParseUUIDPipe) id: string, @Query() query: PortfolioLocaleQueryDto) { return this.publication.preview(PortfolioEntityType.STORY, id, query); }

  @Get('settings') @Header('Cache-Control', 'no-store') @ApiOkResponse({ type: AdminPortfolioSettingsDto })
  getSettings() { return this.admin.getSettings(); }

  @Put('settings') @Header('Cache-Control', 'no-store') @ApiOkResponse({ type: AdminPortfolioSettingsDto })
  updateSettings(@Req() req: AdminRequest, @Body() dto: PortfolioHomeDraftUpdateDto) { return this.admin.updateSettings(req.user.sub, dto.expectedVersion, dto.data); }

  @Post('settings/publish') @HttpCode(200) @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: PortfolioPublicationResponseDto })
  publishSettings(@Body() dto: PublicationCommandDto) { return this.publication.publish(PortfolioEntityType.SETTINGS, '00000000-0000-4000-8000-000000000001', dto.expectedVersion); }

  @Post('settings/archive') @HttpCode(200) @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: PortfolioPublicationResponseDto })
  archiveSettings(@Body() dto: PublicationCommandDto) { return this.publication.archive(PortfolioEntityType.SETTINGS, '00000000-0000-4000-8000-000000000001', dto.expectedVersion); }

  @Get('settings/preview') @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: PortfolioHomePreviewDto })
  previewSettings(@Query() query: PortfolioLocaleQueryDto) { return this.publication.preview(PortfolioEntityType.SETTINGS, '00000000-0000-4000-8000-000000000001', query); }
}
