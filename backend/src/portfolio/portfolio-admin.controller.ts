import {
  Body, Controller, Delete, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Req,
} from '@nestjs/common';
import {
  ApiBadRequestResponse, ApiBearerAuth, ApiConflictResponse, ApiCreatedResponse,
  ApiNoContentResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation,
  ApiParam, ApiTags, ApiUnauthorizedResponse, ApiForbiddenResponse,
} from '@nestjs/swagger';
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
  AdminPortfolioStoryListDto, AdminPortfolioSettingsDto,
} from './dto/admin-response.dto.js';
import { PortfolioListQueryDto } from './dto/query.dto.js';
import { PortfolioAdminService } from './portfolio-admin.service.js';

interface AdminRequest extends Request { user: JwtPayload; }

@ApiTags('portfolio admin drafts')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Authentication required' })
@ApiForbiddenResponse({ description: 'ADMIN role required' })
@ApiBadRequestResponse({ description: 'VALIDATION_FAILED: invalid DTO, UUID or pagination' })
@ApiNotFoundResponse({ description: 'PORTFOLIO_CONTENT_NOT_FOUND: entity or reference not found' })
@ApiConflictResponse({ description: 'PORTFOLIO_VERSION_CONFLICT, PORTFOLIO_SLUG_IMMUTABLE or PORTFOLIO_CONTENT_REFERENCED' })
@AdminOnly()
@Controller('portfolio')
export class PortfolioAdminController {
  constructor(private readonly admin: PortfolioAdminService) {}

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

  @Get('settings') @Header('Cache-Control', 'no-store') @ApiOkResponse({ type: AdminPortfolioSettingsDto })
  getSettings() { return this.admin.getSettings(); }

  @Put('settings') @Header('Cache-Control', 'no-store') @ApiOkResponse({ type: AdminPortfolioSettingsDto })
  updateSettings(@Req() req: AdminRequest, @Body() dto: PortfolioHomeDraftUpdateDto) { return this.admin.updateSettings(req.user.sub, dto.expectedVersion, dto.data); }
}
