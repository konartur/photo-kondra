import { forwardPublicRequest } from '@/lib/api/public-server';

interface RouteContext {
  params: Promise<{ token: string; photoId: string }>;
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { token, photoId } = await params;
  return forwardPublicRequest(
    `/public/photos/${encodeURIComponent(token)}/${encodeURIComponent(photoId)}/download`,
  );
}
