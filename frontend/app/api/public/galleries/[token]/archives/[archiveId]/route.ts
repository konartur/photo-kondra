import { forwardPublicRequest } from '@/lib/api/public-server';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string; archiveId: string }> },
) {
  const { token, archiveId } = await params;
  return forwardPublicRequest(
    `/public/archives/${encodeURIComponent(archiveId)}?token=${encodeURIComponent(token)}`,
  );
}
