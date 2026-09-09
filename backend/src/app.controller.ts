import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service.js';

@ApiTags('health')
@Controller('health')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: 'Check API availability' })
  @ApiOkResponse({ description: 'API is available' })
  getHealth(): { status: 'ok' } {
    return this.appService.getHealth();
  }
}
