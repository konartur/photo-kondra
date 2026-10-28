import { forwardAdminRequest } from '@/lib/api/server';
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ galleryId: string }> },
) {
  const { galleryId } = await params;
  return forwardAdminRequest(`/galleries/${encodeURIComponent(galleryId)}/archive`);
}
