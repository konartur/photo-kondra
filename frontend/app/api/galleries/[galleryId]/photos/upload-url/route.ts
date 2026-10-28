import { forwardAdminRequest } from '@/lib/api/server';

interface RouteContext {
  params: Promise<{ galleryId: string }>;
}

export async function POST(request: Request, { params }: RouteContext) {
  const { galleryId } = await params;
  return forwardAdminRequest(`/galleries/${galleryId}/photos/upload-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: await request.text(),
  });
}
