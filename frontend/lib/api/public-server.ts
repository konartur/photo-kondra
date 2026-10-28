import 'server-only';

import { NextResponse } from 'next/server';
import { backendUrl } from '@/lib/auth/server';

export async function forwardPublicRequest(path: string): Promise<NextResponse> {
  try {
    const backendResponse = await fetch(backendUrl(path), { cache: 'no-store' });
    return new NextResponse(backendResponse.body, {
      status: backendResponse.status,
      headers: {
        'Content-Type': backendResponse.headers.get('content-type') ?? 'application/json',
      },
    });
  } catch {
    return NextResponse.json({ message: 'Gallery service is unavailable' }, { status: 503 });
  }
}
