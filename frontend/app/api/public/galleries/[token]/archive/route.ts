import { forwardPublicRequest } from '@/lib/api/public-server';

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return forwardPublicRequest(`/public/galleries/${encodeURIComponent(token)}/archive`);
}
