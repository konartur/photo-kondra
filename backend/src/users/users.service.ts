import { Injectable } from '@nestjs/common';
import { AuthSession, User, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

export type AuthUser = Pick<User, 'id' | 'email' | 'passwordHash' | 'role'>;
export type PublicUser = Pick<User, 'id' | 'email' | 'role'>;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findAuthUserByEmail(email: string): Promise<AuthUser | null> {
    return this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, passwordHash: true, role: true },
    });
  }

  findAuthUserById(id: string): Promise<AuthUser | null> {
    return this.prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, passwordHash: true, role: true },
    });
  }

  async createAuthSession(params: {
    id: string;
    userId: string;
    refreshTokenHash: string;
    expiresAt: Date;
  }): Promise<void> {
    await this.prisma.authSession.create({ data: params });
  }

  findAuthSession(id: string, userId: string): Promise<AuthSession | null> {
    return this.prisma.authSession.findFirst({ where: { id, userId, revokedAt: null } });
  }

  async rotateAuthSession(id: string, refreshTokenHash: string, expiresAt: Date): Promise<void> {
    await this.prisma.authSession.update({ where: { id }, data: { refreshTokenHash, expiresAt } });
  }

  async revokeAuthSession(id: string): Promise<void> {
    await this.prisma.authSession.update({ where: { id }, data: { revokedAt: new Date() } });
  }

  toPublicUser(user: Pick<AuthUser, 'id' | 'email' | 'role'>): PublicUser {
    return { id: user.id, email: user.email, role: user.role as UserRole };
  }
}
