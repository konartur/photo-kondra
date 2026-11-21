import 'server-only';
import { NextResponse } from 'next/server';
import { forwardAdminRequest } from './server';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const noStore = async (pending: NextResponse | Promise<NextResponse>) => {
  const response = await pending;
  response.headers.set('Cache-Control', 'no-store');
  return response;
};
function invalid() {
  return NextResponse.json(
    { statusCode: 400, code: 'VALIDATION_FAILED', message: 'Invalid portfolio entity ID' },
    { status: 400, headers: { 'Cache-Control': 'no-store' } },
  );
}
async function forwardJson(request: Request, path: string, method: 'POST' | 'PUT' | 'DELETE') {
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json')
    return noStore(NextResponse.json({ statusCode: 415, code: 'UNSUPPORTED_MEDIA_TYPE', message: 'JSON body required' }, { status: 415 }));
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (reader) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 262_144) {
        await reader.cancel();
        return noStore(NextResponse.json({ statusCode: 413, code: 'PAYLOAD_TOO_LARGE', message: 'Portfolio draft is too large' }, { status: 413 }));
      }
      chunks.push(value);
    }
  } catch {
    return noStore(NextResponse.json({ statusCode: 400, code: 'VALIDATION_FAILED', message: 'Cannot read request body' }, { status: 400 }));
  } finally {
    reader?.releaseLock();
  }
  return noStore(await forwardAdminRequest(path, { method, headers: { 'Content-Type': 'application/json' }, body: Buffer.concat(chunks).toString('utf8') }));
}
export async function forwardPortfolioAdminList(resource: 'services' | 'stories', search: string) {
  return noStore(forwardAdminRequest(`/portfolio/${resource}${search}`));
}
export async function forwardPortfolioAdminEntity(resource: 'services' | 'stories', id: string, method: 'GET' | 'PUT' | 'DELETE') {
  if (!uuid.test(id)) return invalid();
  return noStore(forwardAdminRequest(`/portfolio/${resource}/${id}`, { method }));
}
export function forwardPortfolioAdminCreate(request: Request, resource: 'services' | 'stories') {
  return forwardJson(request, `/portfolio/${resource}`, 'POST');
}
export function forwardPortfolioAdminUpdate(request: Request, resource: 'services' | 'stories', id: string, suffix = '') {
  if (!uuid.test(id)) return Promise.resolve(invalid());
  return forwardJson(request, `/portfolio/${resource}/${id}${suffix}`, 'PUT');
}
export function forwardPortfolioAdminDelete(request: Request, resource: 'services' | 'stories', id: string) {
  if (!uuid.test(id)) return Promise.resolve(invalid());
  return forwardJson(request, `/portfolio/${resource}/${id}`, 'DELETE');
}
export async function forwardPortfolioSettings(request?: Request) {
  if (!request) return noStore(forwardAdminRequest('/portfolio/settings'));
  return forwardJson(request, '/portfolio/settings', 'PUT');
}
export function forwardPortfolioLifecycle(request: Request, resource: 'services' | 'stories' | 'settings', action: 'publish' | 'archive', id?: string) {
  if (resource !== 'settings' && (!id || !uuid.test(id))) return Promise.resolve(invalid());
  const path = resource === 'settings' ? `/portfolio/settings/${action}` : `/portfolio/${resource}/${id}/${action}`;
  return forwardJson(request, path, 'POST');
}
export async function forwardPortfolioDraftPreview(resource: 'services' | 'stories' | 'settings', search: string, id?: string) {
  if (resource !== 'settings' && (!id || !uuid.test(id))) return invalid();
  const path = resource === 'settings' ? `/portfolio/settings/preview${search}` : `/portfolio/${resource}/${id}/preview${search}`;
  return noStore(forwardAdminRequest(path));
}
