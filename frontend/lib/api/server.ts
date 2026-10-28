import 'server-only';

import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { ACCESS_TOKEN_COOKIE } from '@/lib/auth/constants';
import { backendUrl } from '@/lib/auth/server';

export async function forwardAdminRequest(path: string, init: RequestInit = {}): Promise<NextResponse> {
  const accessToken = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
  if (!accessToken) return NextResponse.json({ message: 'Authentication required' }, { status: 401 });

  try {
    const backendResponse = await fetch(backendUrl(path), {
      ...init,
      headers: {
        ...init.headers,
        Authorization: `Bearer ${accessToken}`,
      },
      cache: 'no-store',
    });

    return new NextResponse(backendResponse.body, {
      status: backendResponse.status,
      headers: {
        'Content-Type': backendResponse.headers.get('content-type') ?? 'application/json',
      },
    });
  } catch {
    return NextResponse.json({ message: 'API service is unavailable' }, { status: 503 });
  }
}
