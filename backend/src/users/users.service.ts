import { Injectable } from '@nestjs/common';
import { User, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

export type AuthUser = Pick<User, 'id' | 'email' | 'passwordHash' | 'role' | 'refreshTokenHash'>;
export type PublicUser = Pick<User, 'id' | 'email' | 'role'>;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findAuthUserByEmail(email: string): Promise<AuthUser | null> {
    return this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, passwordHash: true, role: true, refreshTokenHash: true },
    });
  }

  findAuthUserById(id: string): Promise<AuthUser | null> {
    return this.prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, passwordHash: true, role: true, refreshTokenHash: true },
    });
  }

  async updateRefreshTokenHash(id: string, refreshTokenHash: string | null): Promise<void> {
    await this.prisma.user.update({ where: { id }, data: { refreshTokenHash } });
  }

  toPublicUser(user: Pick<AuthUser, 'id' | 'email' | 'role'>): PublicUser {
    return { id: user.id, email: user.email, role: user.role as UserRole };
  }
}
