import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Redirect,
  Req,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import type { JwtPayload } from '../auth/auth.types.js';
import { AdminOnly } from '../auth/roles.decorator.js';
import { RequestPortfolioUploadDto } from './dto/admin-input.dto.js';
import {
  AdminPortfolioMediaDto,
  AdminPortfolioMediaListDto,
  PortfolioUploadResponseDto,
} from './dto/admin-response.dto.js';
import { PortfolioMediaListQueryDto } from './dto/query.dto.js';
import { PortfolioMediaService } from './media/portfolio-media.service.js';

interface AdminRequest extends Request {
  user: JwtPayload;
}

@ApiTags('portfolio media')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Authentication required' })
@ApiForbiddenResponse({ description: 'ADMIN role required' })
@ApiBadRequestResponse({ description: 'VALIDATION_FAILED: invalid metadata, ID or cursor' })
@ApiNotFoundResponse({
  description: 'PORTFOLIO_CONTENT_NOT_FOUND: missing, deleted or foreign media',
})
@ApiServiceUnavailableResponse({ description: 'Database, storage or processing queue unavailable' })
@AdminOnly()
@Controller('portfolio/media')
export class PortfolioMediaController {
  constructor(private readonly media: PortfolioMediaService) {}

  @Post('upload-url')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Create an independent portfolio upload; PUT bytes directly to private storage using requiredHeaders',
  })
  @ApiCreatedResponse({ type: PortfolioUploadResponseDto })
  requestUpload(@Req() request: AdminRequest, @Body() dto: RequestPortfolioUploadDto) {
    return this.media.requestUpload(request.user.sub, dto);
  }

  @Post(':id/upload-complete')
  @Header('Cache-Control', 'no-store')
  @HttpCode(202)
  @ApiOperation({
    summary:
      'Idempotently complete upload; actual file validation and derivatives run asynchronously',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiAcceptedResponse({ type: AdminPortfolioMediaDto })
  complete(@Req() request: AdminRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.media.complete(request.user.sub, id);
  }

  @Post(':id/retry')
  @Header('Cache-Control', 'no-store')
  @HttpCode(202)
  @ApiOperation({
    summary:
      'Retry failed portfolio processing or recover a stalled request; never changes a READY derivative',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiAcceptedResponse({ type: AdminPortfolioMediaDto })
  @ApiConflictResponse({ description: 'PORTFOLIO_NOT_READY: original upload is not completed' })
  retry(@Req() request: AdminRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.media.retry(request.user.sub, id);
  }

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Search own portfolio media by filename with an authenticated search/context/version-bound cursor',
  })
  @ApiOkResponse({ type: AdminPortfolioMediaListDto })
  @ApiConflictResponse({
    description: 'PORTFOLIO_CURSOR_STALE: restart pagination after publication changes',
  })
  list(@Req() request: AdminRequest, @Query() query: PortfolioMediaListQueryDto) {
    return this.media.list(request.user.sub, query);
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Read own media processing state, dimensions and authenticated preview route',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: AdminPortfolioMediaDto })
  detail(@Req() request: AdminRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.media.detail(request.user.sub, id);
  }

  @Get(':id/variants/:variantId')
  @Header('Cache-Control', 'no-store')
  @Redirect(undefined, 302)
  @Header('Referrer-Policy', 'no-referrer')
  @ApiOperation({
    summary:
      'Authorize an immutable READY derivative and redirect to short-lived signed storage GET; originals are never returned',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'variantId', format: 'uuid' })
  @ApiResponse({
    status: 302,
    description: 'Private derivative redirect',
    headers: {
      Location: { schema: { type: 'string' }, description: 'Short-lived signed derivative GET' },
      'Cache-Control': { schema: { type: 'string', enum: ['no-store'] } },
    },
  })
  async preview(
    @Req() request: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('variantId', ParseUUIDPipe) variantId: string,
  ) {
    return { url: await this.media.preview(request.user.sub, id, variantId) };
  }

  @Delete(':id')
  @Header('Cache-Control', 'no-store')
  @HttpCode(204)
  @ApiOperation({
    summary:
      'Soft-delete unreferenced media; revoke processing claims and retry private-object cleanup in maintenance',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse({
    description: 'Media hidden immediately; storage cleanup is idempotent and retried',
  })
  @ApiConflictResponse({
    description: 'PORTFOLIO_CONTENT_REFERENCED: used by draft or active publication',
  })
  remove(@Req() request: AdminRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.media.remove(request.user.sub, id);
  }
}
