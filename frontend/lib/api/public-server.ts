import 'server-only';

import { NextResponse } from 'next/server';
import { backendUrl } from '@/lib/auth/server';
import { backendResponseHeaders } from './response-headers';
import { backendClientHeaders } from './backend-client';

export async function forwardPublicRequest(
  path: string,
  method: 'GET' | 'POST' = 'GET',
  body?: string,
): Promise<NextResponse> {
  try {
    const backendResponse = await fetch(backendUrl(path), {
      cache: 'no-store',
      method,
      body,
      headers: {
        ...(await backendClientHeaders(backendUrl(path), method)),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
    return new NextResponse(backendResponse.body, {
      status: backendResponse.status,
      headers: backendResponseHeaders(backendResponse),
    });
  } catch {
    return NextResponse.json({ message: 'Gallery service is unavailable' }, { status: 503 });
  }
}
