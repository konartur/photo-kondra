import 'server-only';

import { NextResponse } from 'next/server';
import { backendUrl } from '@/lib/auth/server';

export async function forwardPublicRequest(
  path: string,
  method: 'GET' | 'POST' = 'GET',
): Promise<NextResponse> {
  try {
    const backendResponse = await fetch(backendUrl(path), { cache: 'no-store', method });
    return new NextResponse(backendResponse.body, {
      status: backendResponse.status,
      headers: {
        'Content-Type': backendResponse.headers.get('content-type') ?? 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return NextResponse.json({ message: 'Gallery service is unavailable' }, { status: 503 });
  }
}
