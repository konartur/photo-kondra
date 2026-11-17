import 'server-only';

import { cookies } from 'next/headers';
import { ACCESS_TOKEN_COOKIE } from './constants';
import { backendClientHeaders } from '../api/backend-client';

export interface AuthenticatedAdmin {
  id: string;
  email: string;
  role: 'ADMIN';
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export function backendUrl(path: string): string {
  const baseUrl = process.env.API_URL;
  if (!baseUrl) throw new Error('API_URL is not configured');

  return new URL(`/api/v1${path}`, baseUrl).toString();
}

export type AdminSession =
  | { state: 'authenticated'; admin: AuthenticatedAdmin }
  | { state: 'unauthenticated' }
  | { state: 'unavailable'; message: string; retryAfter?: number };

export async function getAdminSession(): Promise<AdminSession> {
  const accessToken = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
  if (!accessToken) return { state: 'unauthenticated' };

  try {
    const response = await fetch(backendUrl('/auth/me'), {
      headers: {
        ...(await backendClientHeaders(backendUrl('/auth/me'))),
        Authorization: `Bearer ${accessToken}`,
      },
      cache: 'no-store',
    });
    if (response.status === 401) return { state: 'unauthenticated' };
    if (!response.ok) {
      const retry = Number(response.headers.get('retry-after'));
      return {
        state: 'unavailable',
        message:
          response.status === 429
            ? 'Too many requests. Please try again shortly.'
            : 'Authentication service is temporarily unavailable.',
        ...(Number.isSafeInteger(retry) && retry > 0 && retry <= 3600 ? { retryAfter: retry } : {}),
      };
    }
    const admin: unknown = await response.json();
    if (
      typeof admin !== 'object' ||
      admin === null ||
      !('id' in admin) ||
      typeof admin.id !== 'string' ||
      !('email' in admin) ||
      typeof admin.email !== 'string' ||
      !('role' in admin) ||
      admin.role !== 'ADMIN'
    )
      throw new Error('Invalid authentication response');
    return {
      state: 'authenticated',
      admin: { id: admin.id, email: admin.email, role: admin.role },
    };
  } catch {
    return { state: 'unavailable', message: 'Authentication service is temporarily unavailable.' };
  }
}
