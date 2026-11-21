import 'server-only';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { ACCESS_TOKEN_COOKIE } from '@/lib/auth/constants';
import { backendUrl } from '@/lib/auth/server';
import { backendClientHeaders } from './backend-client';
import { backendResponseHeaders } from './response-headers';
import { forwardAdminRequest } from './server';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function errorResponse(status: number, code: string, message: string): NextResponse {
  return NextResponse.json(
    { statusCode: status, code, message },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}
async function metadataResponse(path: string, init?: RequestInit): Promise<NextResponse> {
  const response = await forwardAdminRequest(path, init);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
export function forwardPortfolioMediaList(search: string) {
  return metadataResponse(`/portfolio/media${search}`);
}

export function forwardPortfolioMedia(
  mediaId: string,
  method: 'GET' | 'DELETE' | 'POST' = 'GET',
  action?: 'retry' | 'upload-complete',
): Promise<NextResponse> | NextResponse {
  if (!uuid.test(mediaId)) return errorResponse(400, 'VALIDATION_FAILED', 'Invalid media ID');
  return metadataResponse(`/portfolio/media/${mediaId}${action ? `/${action}` : ''}`, {
    method,
  });
}

export async function forwardPortfolioUpload(request: Request): Promise<NextResponse> {
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json')
    return errorResponse(415, 'UNSUPPORTED_MEDIA_TYPE', 'JSON metadata required');
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (reader) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 65_536) {
        await reader.cancel();
        return errorResponse(413, 'PAYLOAD_TOO_LARGE', 'Metadata body is too large');
      }
      chunks.push(value);
    }
  } catch {
    return errorResponse(400, 'VALIDATION_FAILED', 'Cannot read metadata body');
  } finally {
    reader?.releaseLock();
  }
  return metadataResponse('/portfolio/media/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: Buffer.concat(chunks).toString('utf8'),
  });
}

/** Never follow the signed redirect on the server or forward the admin JWT to S3. */
export async function forwardPortfolioPreview(
  mediaId: string,
  variantId: string,
): Promise<NextResponse> {
  if (!uuid.test(mediaId) || !uuid.test(variantId))
    return errorResponse(400, 'VALIDATION_FAILED', 'Invalid media ID');
  const path = `/portfolio/media/${mediaId}/variants/${variantId}`;
  const accessToken = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
  if (!accessToken) return errorResponse(401, 'UNAUTHORIZED', 'Authentication required');
  try {
    const response = await fetch(backendUrl(path), {
      redirect: 'manual',
      cache: 'no-store',
      headers: {
        ...(await backendClientHeaders(backendUrl(path), 'GET')),
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (response.status >= 400)
      return new NextResponse(response.body, {
        status: response.status,
        headers: backendResponseHeaders(response),
      });
    if (response.status !== 302) throw new Error('Unexpected preview response');
    const location = response.headers.get('location');
    if (!location) throw new Error('Missing redirect');
    const target = new URL(location);
    if (
      target.username ||
      target.password ||
      target.hash ||
      (target.protocol !== 'https:' &&
        !(process.env.NODE_ENV !== 'production' && target.protocol === 'http:'))
    )
      throw new Error('Invalid redirect');
    return new NextResponse(null, {
      status: 302,
      headers: {
        Location: location,
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
      },
    });
  } catch {
    return errorResponse(503, 'SERVICE_UNAVAILABLE', 'Preview unavailable');
  }
}
