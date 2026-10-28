import { forwardAdminRequest } from '@/lib/api/server';

interface RouteContext {
  params: Promise<{ galleryId: string }>;
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const { galleryId } = await params;
  return forwardAdminRequest(`/galleries/${galleryId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: await request.text(),
  });
}
