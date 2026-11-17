import { NextResponse } from 'next/server';
import { setAuthCookies } from '@/lib/auth/cookies';
import { backendUrl } from '@/lib/auth/server';
import { backendResponseHeaders } from '@/lib/api/response-headers';
import { backendClientHeaders } from '@/lib/api/backend-client';

interface LoginRequest {
  email?: unknown;
  password?: unknown;
}

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
}

export async function POST(request: Request) {
  let body: LoginRequest;
  try {
    body = (await request.json()) as LoginRequest;
  } catch {
    return NextResponse.json({ message: 'Invalid login request' }, { status: 400 });
  }

  if (typeof body.email !== 'string' || typeof body.password !== 'string') {
    return NextResponse.json({ message: 'Email and password are required' }, { status: 400 });
  }

  try {
    const backendResponse = await fetch(backendUrl('/auth/login'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(await backendClientHeaders(backendUrl('/auth/login'), 'POST')),
      },
      body: JSON.stringify({ email: body.email, password: body.password }),
      cache: 'no-store',
    });

    if (!backendResponse.ok) {
      return new NextResponse(backendResponse.body, {
        status: backendResponse.status,
        headers: backendResponseHeaders(backendResponse),
      });
    }

    const tokens = (await backendResponse.json()) as LoginResponse;
    if (!tokens.accessToken || !tokens.refreshToken) {
      return NextResponse.json(
        { message: 'Authentication service returned an invalid response' },
        { status: 502 },
      );
    }

    const response = NextResponse.json({ ok: true });
    setAuthCookies(response, tokens);
    return response;
  } catch {
    return NextResponse.json({ message: 'Authentication service is unavailable' }, { status: 503 });
  }
}
