import { forwardAdminRequest } from '@/lib/api/server';

interface RouteContext {
  params: Promise<{ photoId: string }>;
}

export async function POST(_request: Request, { params }: RouteContext) {
  const { photoId } = await params;
  return forwardAdminRequest(`/photos/${photoId}/upload-complete`, { method: 'POST' });
}
