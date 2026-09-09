import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import * as argon2 from 'argon2';
import { describe, expect, it, jest } from '@jest/globals';
import { AuthUser, UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';

describe('AuthService', () => {
  const configService = {
    getOrThrow: jest.fn((key: string) => (key === 'JWT_ACCESS_SECRET' ? 'access-secret' : 'refresh-secret')),
    get: jest.fn(() => '15m'),
  } as unknown as ConfigService;

  it('issues tokens and stores only a hash of the refresh token', async () => {
    const passwordHash = await argon2.hash('correct horse battery staple');
    const updateRefreshTokenHash = jest.fn<(id: string, refreshTokenHash: string | null) => Promise<void>>();
    const usersService = {
      findAuthUserByEmail: jest.fn<() => Promise<AuthUser | null>>().mockResolvedValue({
        id: 'user-id', email: 'admin@example.com', passwordHash, role: UserRole.ADMIN, refreshTokenHash: null,
      }),
      updateRefreshTokenHash,
    } as unknown as UsersService;
    const service = new AuthService(usersService, new JwtService(), configService);

    const tokens = await service.login('ADMIN@EXAMPLE.COM', 'correct horse battery staple');

    expect(tokens.accessToken).toBeTruthy();
    expect(tokens.refreshToken).toBeTruthy();
    expect(updateRefreshTokenHash).toHaveBeenCalledWith('user-id', expect.not.stringContaining(tokens.refreshToken));
  });

  it('rejects invalid credentials without revealing which field failed', async () => {
    const usersService = {
      findAuthUserByEmail: jest.fn<() => Promise<AuthUser | null>>().mockResolvedValue(null),
    } as unknown as UsersService;
    const service = new AuthService(usersService, new JwtService(), configService);

    await expect(service.login('admin@example.com', 'incorrect password')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
