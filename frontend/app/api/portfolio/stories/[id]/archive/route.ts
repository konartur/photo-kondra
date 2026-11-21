import { forwardPortfolioLifecycle } from '@/lib/api/portfolio-admin-server';
type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, { params }: Context) { return forwardPortfolioLifecycle(request, 'stories', 'archive', (await params).id); }
