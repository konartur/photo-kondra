import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { describe, expect, it, jest } from '@jest/globals';
import { RolesGuard } from './roles.guard.js';

describe('RolesGuard', () => {
  const context = (role?: UserRole): ExecutionContext =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({ getRequest: () => ({ user: role ? { role } : undefined }) }),
    }) as unknown as ExecutionContext;

  it('allows a request when an endpoint has no role metadata', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    } as unknown as Reflector;
    expect(new RolesGuard(reflector).canActivate(context())).toBe(true);
  });

  it('allows an administrator for an administrator-only endpoint', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([UserRole.ADMIN]),
    } as unknown as Reflector;
    expect(new RolesGuard(reflector).canActivate(context(UserRole.ADMIN))).toBe(true);
  });

  it('denies a request without an authenticated user when roles are required', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([UserRole.ADMIN]),
    } as unknown as Reflector;
    expect(new RolesGuard(reflector).canActivate(context())).toBe(false);
  });
});
