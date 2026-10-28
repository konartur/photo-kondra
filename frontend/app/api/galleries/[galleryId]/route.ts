import { forwardAdminRequest } from '@/lib/api/server';

interface RouteContext {
  params: Promise<{ galleryId: string }>;
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { galleryId } = await params;
  return forwardAdminRequest(`/galleries/${galleryId}`);
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const { galleryId } = await params;
  return forwardAdminRequest(`/galleries/${galleryId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: await request.text(),
  });
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { galleryId } = await params;
  return forwardAdminRequest(`/galleries/${galleryId}`, { method: 'DELETE' });
}
