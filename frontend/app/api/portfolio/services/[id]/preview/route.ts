import { forwardPortfolioDraftPreview } from '@/lib/api/portfolio-admin-server';
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, { params }: Context) { return forwardPortfolioDraftPreview('services', new URL(request.url).search, (await params).id); }
