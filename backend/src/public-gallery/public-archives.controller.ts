import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiGoneResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiAcceptedResponse,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import {
  ArchiveAccessQueryDto,
  PublicArchiveResponseDto,
  RequestSelectedArchiveDto,
} from './dto/public-archive.dto.js';
import { PublicArchivesService } from './public-archives.service.js';

@ApiTags('public archives')
@Controller('public')
export class PublicArchivesController {
  constructor(private readonly archives: PublicArchivesService) {}

  @Post('galleries/:token/archives')
  @HttpCode(202)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Prepare a ZIP of selected READY photos asynchronously; reuse identical unexpired selections',
  })
  @ApiParam({ name: 'token', description: 'Private gallery access token' })
  @ApiAcceptedResponse({ type: PublicArchiveResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid selection or archive size limit exceeded' })
  @ApiNotFoundResponse({ description: 'Invalid access or unpublished gallery' })
  @ApiTooManyRequestsResponse({
    description: 'Gallery archive request or concurrency limit reached',
  })
  @ApiServiceUnavailableResponse({ description: 'Archive queue unavailable' })
  requestSelected(@Param('token') token: string, @Body() dto: RequestSelectedArchiveDto) {
    return this.archives.requestSelected(token, dto.photoIds);
  }

  @Get('galleries/:token/archive')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Get the prebuilt gallery ZIP; never starts archive generation' })
  @ApiParam({ name: 'token', description: 'Private gallery access token' })
  @ApiOkResponse({ type: PublicArchiveResponseDto })
  @ApiConflictResponse({ description: 'Photographer has not prepared the ZIP' })
  @ApiGoneResponse({ description: 'Archive expired' })
  @ApiNotFoundResponse({ description: 'Invalid, revoked or expired gallery access' })
  @ApiServiceUnavailableResponse({ description: 'Archive download unavailable' })
  request(@Param('token') token: string) {
    return this.archives.request(token);
  }

  @Get('archives/:archiveId')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Read archive status; a gallery token is required on every request' })
  @ApiParam({ name: 'archiveId', format: 'uuid' })
  @ApiOkResponse({ type: PublicArchiveResponseDto })
  @ApiBadRequestResponse({ description: 'Missing token or invalid archive ID' })
  @ApiNotFoundResponse({ description: 'Invalid access or archive belongs to another gallery' })
  @ApiGoneResponse({ description: 'Archive expired' })
  @ApiServiceUnavailableResponse({ description: 'Archive download unavailable' })
  status(
    @Param('archiveId', ParseUUIDPipe) archiveId: string,
    @Query() query: ArchiveAccessQueryDto,
  ) {
    return this.archives.status(query.token, archiveId);
  }
}
