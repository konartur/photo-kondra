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
    getOrThrow: jest.fn((key: string) =>
      key === 'JWT_ACCESS_SECRET' ? 'access-secret' : 'refresh-secret',
    ),
    get: jest.fn(() => '15m'),
  } as unknown as ConfigService;

  it('issues tokens and stores only a hash of the refresh token', async () => {
    const passwordHash = await argon2.hash('correct horse battery staple');
    const createAuthSession = jest.fn<(params: unknown) => Promise<void>>();
    const usersService = {
      findAuthUserByEmail: jest.fn<() => Promise<AuthUser | null>>().mockResolvedValue({
        id: 'user-id',
        email: 'admin@example.com',
        passwordHash,
        role: UserRole.ADMIN,
      }),
      createAuthSession,
    } as unknown as UsersService;
    const service = new AuthService(usersService, new JwtService(), configService);

    const tokens = await service.login('ADMIN@EXAMPLE.COM', 'correct horse battery staple');

    expect(tokens.accessToken).toBeTruthy();
    expect(tokens.refreshToken).toBeTruthy();
    expect(createAuthSession).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-id' }));
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

  it('rotates a valid refresh token', async () => {
    const passwordHash = await argon2.hash('correct horse battery staple');
    let refreshTokenHash: string | null = null;
    const user: AuthUser = {
      id: 'user-id',
      email: 'admin@example.com',
      passwordHash,
      role: UserRole.ADMIN,
    };
    const usersService = {
      findAuthUserByEmail: jest.fn<() => Promise<AuthUser | null>>().mockResolvedValue(user),
      findAuthUserById: jest.fn<() => Promise<AuthUser | null>>().mockResolvedValue(user),
      findAuthSession: jest.fn().mockImplementation(async () => ({
        id: 'session-id',
        userId: 'user-id',
        refreshTokenHash,
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
      })),
      createAuthSession: jest.fn(async (params: { refreshTokenHash: string }) => {
        refreshTokenHash = params.refreshTokenHash;
      }),
      rotateAuthSession: jest.fn(async (_id: string, hash: string) => {
        refreshTokenHash = hash;
      }),
    } as unknown as UsersService;
    const service = new AuthService(usersService, new JwtService(), configService);
    const initialTokens = await service.login('admin@example.com', 'correct horse battery staple');

    const rotatedTokens = await service.refresh(initialTokens.refreshToken);

    expect(rotatedTokens.accessToken).toBeTruthy();
    expect(rotatedTokens.refreshToken).not.toBe(initialTokens.refreshToken);
  });

  it('revokes refresh tokens on logout and returns no password data from getMe', async () => {
    const revokeAuthSession = jest.fn<(id: string) => Promise<void>>();
    const usersService = {
      revokeAuthSession,
      findAuthUserById: jest.fn<() => Promise<AuthUser | null>>().mockResolvedValue({
        id: 'user-id',
        email: 'admin@example.com',
        passwordHash: 'hash',
        role: UserRole.ADMIN,
      }),
      toPublicUser: jest.fn().mockReturnValue({
        id: 'user-id',
        email: 'admin@example.com',
        role: UserRole.ADMIN,
      }),
    } as unknown as UsersService;
    const service = new AuthService(usersService, new JwtService(), configService);

    await service.logout('session-id');
    const me = await service.getMe('user-id');

    expect(revokeAuthSession).toHaveBeenCalledWith('session-id');
    expect(me).toEqual({ id: 'user-id', email: 'admin@example.com', role: UserRole.ADMIN });
  });
});
