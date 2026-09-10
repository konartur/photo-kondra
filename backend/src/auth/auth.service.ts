import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
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

    const sessionId = randomUUID();
    const tokens = await this.createTokens(user, sessionId);
    await this.usersService.createAuthSession({
      id: sessionId,
      userId: user.id,
      refreshTokenHash: await argon2.hash(tokens.refreshToken),
      expiresAt: this.getRefreshExpiry(),
    });
    return tokens;
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

    const session = await this.usersService.findAuthSession(payload.sessionId, payload.sub);
    if (
      !session ||
      session.expiresAt <= new Date() ||
      !(await argon2.verify(session.refreshTokenHash, refreshToken))
    ) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const user = await this.usersService.findAuthUserById(payload.sub);
    if (!user) throw new UnauthorizedException('Invalid refresh token');
    const tokens = await this.createTokens(user, session.id);
    await this.usersService.rotateAuthSession(
      session.id,
      await argon2.hash(tokens.refreshToken),
      this.getRefreshExpiry(),
    );
    return tokens;
  }

  async logout(sessionId: string): Promise<void> {
    await this.usersService.revokeAuthSession(sessionId);
  }

  async getMe(userId: string): Promise<PublicUser> {
    const user = await this.usersService.findAuthUserById(userId);
    if (!user) {
      throw new UnauthorizedException();
    }
    return this.usersService.toPublicUser(user);
  }

  private async createTokens(user: AuthUser, sessionId: string): Promise<AuthTokens> {
    const payloadBase = { sub: user.id, email: user.email, role: user.role, sessionId };
    const accessToken = await this.signToken(payloadBase, 'access');
    const refreshToken = await this.signToken(payloadBase, 'refresh');
    return { accessToken, refreshToken };
  }

  private signToken(payloadBase: Omit<JwtPayload, 'type'>, type: TokenType): Promise<string> {
    const isAccessToken = type === 'access';
    return this.jwtService.signAsync(
      { ...payloadBase, type, jti: type === 'refresh' ? randomUUID() : undefined },
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

  private getRefreshExpiry(): Date {
    const value = this.configService.get<string>('JWT_REFRESH_TTL', '7d');
    const match = /^(\d+)(s|m|h|d)$/.exec(value);
    if (!match) return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const amount = Number(match[1]);
    const milliseconds = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[
      match[2] as 's' | 'm' | 'h' | 'd'
    ];
    return new Date(Date.now() + amount * milliseconds);
  }
}
