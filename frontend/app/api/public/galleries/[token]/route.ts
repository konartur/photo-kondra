import { forwardPublicRequest } from '@/lib/api/public-server';

interface RouteContext {
  params: Promise<{ token: string }>;
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { token } = await params;
  return forwardPublicRequest(`/public/galleries/${encodeURIComponent(token)}`);
}
