import { forwardAdminRequest } from '@/lib/api/server';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ galleryId: string }> },
) {
  const { galleryId } = await params;
  const response = await forwardAdminRequest(
    `/galleries/${encodeURIComponent(galleryId)}/access-links`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    },
  );
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
