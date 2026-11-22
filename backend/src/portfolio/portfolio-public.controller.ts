import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Query,
  Redirect,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PortfolioPublicReader } from './portfolio-public-reader.js';
import { PortfolioLocaleQueryDto, PortfolioPublicListQueryDto } from './dto/query.dto.js';
import {
  PortfolioHomePageDto,
  PortfolioServiceListDto,
  PortfolioServicePageDto,
  PortfolioSiteResponseDto,
  PortfolioSitemapDto,
  PortfolioStoryPageDto,
} from './dto/public.dto.js';

function portfolioSlug(slug: string) {
  if (slug.length > 80 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
    throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Invalid portfolio slug' });
  return slug;
}

@ApiTags('portfolio public')
@ApiBadRequestResponse({ description: 'Invalid locale, slug, cursor or media ID' })
@ApiNotFoundResponse({ description: 'No active publication for this resource' })
@ApiServiceUnavailableResponse({
  description: 'Portfolio database, snapshot or storage unavailable',
})
@Controller('public/portfolio')
export class PortfolioPublicController {
  constructor(private readonly reader: PortfolioPublicReader) {}

  @Get('site')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: PortfolioSiteResponseDto })
  site(@Query() query: PortfolioLocaleQueryDto): Promise<PortfolioSiteResponseDto> {
    return this.reader.site(query.locale);
  }

  @Get('home')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: PortfolioHomePageDto })
  home(@Query() query: PortfolioLocaleQueryDto): Promise<PortfolioHomePageDto> {
    return this.reader.home(query.locale);
  }

  @Get('services')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: PortfolioServiceListDto })
  @ApiConflictResponse({ description: 'PORTFOLIO_CURSOR_STALE' })
  services(@Query() query: PortfolioPublicListQueryDto): Promise<PortfolioServiceListDto> {
    return this.reader.services(query);
  }

  @Get('services/:slug')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: PortfolioServicePageDto })
  @ApiConflictResponse({ description: 'PORTFOLIO_CURSOR_STALE' })
  service(
    @Param('slug') slug: string,
    @Query() query: PortfolioPublicListQueryDto,
  ): Promise<PortfolioServicePageDto> {
    return this.reader.service(portfolioSlug(slug), query);
  }

  @Get('stories/:slug')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: PortfolioStoryPageDto })
  story(
    @Param('slug') slug: string,
    @Query() query: PortfolioLocaleQueryDto,
  ): Promise<PortfolioStoryPageDto> {
    return this.reader.story(portfolioSlug(slug), query.locale);
  }

  @Get('sitemap')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: PortfolioSitemapDto })
  sitemap(): Promise<PortfolioSitemapDto> {
    return this.reader.sitemap();
  }

  @Get('media/:mediaId/variants/:variantId')
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  @Redirect(undefined, 302)
  @ApiResponse({
    status: 302,
    description: 'Signed published derivative',
    headers: {
      Location: { schema: { type: 'string' } },
      'Cache-Control': { schema: { type: 'string', enum: ['no-store'] } },
    },
  })
  async media(
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @Param('variantId', ParseUUIDPipe) variantId: string,
  ) {
    return { url: await this.reader.derivative(mediaId, variantId) };
  }
}
