import { Controller, Get, Header, Param, ParseUUIDPipe, Query } from '@nestjs/common';
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
} from '@nestjs/swagger';
import { ArchiveAccessQueryDto, PublicArchiveResponseDto } from './dto/public-archive.dto.js';
import { PublicArchivesService } from './public-archives.service.js';

@ApiTags('public archives')
@Controller('public')
export class PublicArchivesController {
  constructor(private readonly archives: PublicArchivesService) {}

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
