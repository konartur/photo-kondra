import { UserRole } from '@prisma/client';

export type TokenType = 'access' | 'refresh';

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  type: TokenType;
  sessionId: string;
  jti?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}
