import { forwardPublicRequest } from '@/lib/api/public-server';

interface RouteContext {
  params: Promise<{ token: string }>;
}

export async function GET(request: Request, { params }: RouteContext) {
  const { token } = await params;
  const query = new URL(request.url).searchParams;
  const suffix = query.size ? `?${query.toString()}` : '';
  return forwardPublicRequest(`/public/galleries/${encodeURIComponent(token)}/photos${suffix}`);
}
