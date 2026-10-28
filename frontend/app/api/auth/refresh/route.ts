import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { REFRESH_TOKEN_COOKIE } from '@/lib/auth/constants';
import { clearAuthCookies, setAuthCookies } from '@/lib/auth/cookies';
import { backendUrl } from '@/lib/auth/server';

interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}

export async function POST() {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;
  if (!refreshToken) return unauthenticatedResponse();

  try {
    const backendResponse = await fetch(backendUrl('/auth/refresh'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store',
    });
    if (!backendResponse.ok) return unauthenticatedResponse();

    const tokens = (await backendResponse.json()) as RefreshResponse;
    if (!tokens.accessToken || !tokens.refreshToken) return unauthenticatedResponse();

    const response = NextResponse.json({ ok: true });
    setAuthCookies(response, tokens);
    return response;
  } catch {
    return NextResponse.json({ message: 'Authentication service is unavailable' }, { status: 503 });
  }
}

function unauthenticatedResponse(): NextResponse {
  const response = NextResponse.json({ message: 'Authentication required' }, { status: 401 });
  clearAuthCookies(response);
  return response;
}
