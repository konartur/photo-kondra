import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { ACCESS_TOKEN_COOKIE } from '@/lib/auth/constants';
import { clearAuthCookies } from '@/lib/auth/cookies';
import { backendUrl } from '@/lib/auth/server';
import { backendClientHeaders } from '@/lib/api/backend-client';

export async function POST() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;

  if (accessToken) {
    try {
      await fetch(backendUrl('/auth/logout'), {
        method: 'POST',
        headers: {
          ...(await backendClientHeaders(backendUrl('/auth/logout'), 'POST')),
          Authorization: `Bearer ${accessToken}`,
        },
        cache: 'no-store',
      });
    } catch {
      // Clear the browser session even if the backend is temporarily unavailable.
    }
  }

  const response = NextResponse.json({ ok: true });
  clearAuthCookies(response);
  return response;
}
