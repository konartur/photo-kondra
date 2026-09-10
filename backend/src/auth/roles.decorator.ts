import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { RolesGuard } from './roles.guard.js';

export const ROLES_KEY = 'roles';

export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

export const AdminOnly = () =>
  applyDecorators(Roles(UserRole.ADMIN), UseGuards(JwtAuthGuard, RolesGuard));
