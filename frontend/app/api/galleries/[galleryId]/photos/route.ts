import { forwardAdminRequest } from '@/lib/api/server';

interface RouteContext {
  params: Promise<{ galleryId: string }>;
}

export async function GET(request: Request, { params }: RouteContext) {
  const { galleryId } = await params;
  const query = new URL(request.url).searchParams;
  const suffix = query.size ? `?${query.toString()}` : '';
  return forwardAdminRequest(`/galleries/${galleryId}/photos${suffix}`);
}
