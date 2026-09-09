import { Controller, Get, HttpCode, Post, Body, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthService } from './auth.service.js';
import { JwtPayload } from './auth.types.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @ApiOperation({ summary: 'Sign in as the administrator' })
  @ApiOkResponse({ description: 'Access and refresh tokens' })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  login(@Body() dto: LoginDto) { return this.authService.login(dto.email, dto.password); }

  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rotate refresh token' })
  refresh(@Body() dto: RefreshTokenDto) { return this.authService.refresh(dto.refreshToken); }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke the current refresh session' })
  async logout(@Req() request: AuthenticatedRequest): Promise<void> { await this.authService.logout(request.user.sub); }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the authenticated administrator' })
  getMe(@Req() request: AuthenticatedRequest) { return this.authService.getMe(request.user.sub); }
}
