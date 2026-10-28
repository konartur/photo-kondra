import 'server-only';

import { cookies } from 'next/headers';
import { ACCESS_TOKEN_COOKIE } from './constants';

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

export async function getAuthenticatedAdmin(): Promise<AuthenticatedAdmin | null> {
  const accessToken = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
  if (!accessToken) return null;

  try {
    const response = await fetch(backendUrl('/auth/me'), {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });
    if (!response.ok) return null;

    return (await response.json()) as AuthenticatedAdmin;
  } catch {
    return null;
  }
}
