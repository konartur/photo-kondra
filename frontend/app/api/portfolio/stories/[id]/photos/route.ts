import { forwardPortfolioAdminUpdate } from '@/lib/api/portfolio-admin-server';
type Context = { params: Promise<{ id: string }> };
export async function PUT(request: Request, { params }: Context) { return forwardPortfolioAdminUpdate(request, 'stories', (await params).id, '/photos'); }
