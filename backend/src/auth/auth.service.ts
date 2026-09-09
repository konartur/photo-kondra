import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { AuthUser, PublicUser, UsersService } from '../users/users.service.js';
import { AuthTokens, JwtPayload, TokenType } from './auth.types.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(email: string, password: string): Promise<AuthTokens> {
    const user = await this.usersService.findAuthUserByEmail(email.toLowerCase());

    if (!user || !(await argon2.verify(user.passwordHash, password))) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.issueTokens(user);
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.usersService.findAuthUserById(payload.sub);
    if (!user?.refreshTokenHash || !(await argon2.verify(user.refreshTokenHash, refreshToken))) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return this.issueTokens(user);
  }

  async logout(userId: string): Promise<void> {
    await this.usersService.updateRefreshTokenHash(userId, null);
  }

  async getMe(userId: string): Promise<PublicUser> {
    const user = await this.usersService.findAuthUserById(userId);
    if (!user) {
      throw new UnauthorizedException();
    }
    return this.usersService.toPublicUser(user);
  }

  private async issueTokens(user: AuthUser): Promise<AuthTokens> {
    const payloadBase = { sub: user.id, email: user.email, role: user.role };
    const accessToken = await this.signToken(payloadBase, 'access');
    const refreshToken = await this.signToken(payloadBase, 'refresh');
    await this.usersService.updateRefreshTokenHash(user.id, await argon2.hash(refreshToken));
    return { accessToken, refreshToken };
  }

  private signToken(payloadBase: Omit<JwtPayload, 'type'>, type: TokenType): Promise<string> {
    const isAccessToken = type === 'access';
    return this.jwtService.signAsync(
      { ...payloadBase, type },
      {
        secret: this.configService.getOrThrow<string>(
          isAccessToken ? 'JWT_ACCESS_SECRET' : 'JWT_REFRESH_SECRET',
        ),
        expiresIn: this.configService.get<string>(
          isAccessToken ? 'JWT_ACCESS_TTL' : 'JWT_REFRESH_TTL',
          isAccessToken ? '15m' : '7d',
        ) as `${number}${'s' | 'm' | 'h' | 'd'}`,
      },
    );
  }
}
