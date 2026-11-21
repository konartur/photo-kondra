import { forwardPortfolioAdminDelete, forwardPortfolioAdminEntity, forwardPortfolioAdminUpdate } from '@/lib/api/portfolio-admin-server';
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Context) { return forwardPortfolioAdminEntity('stories', (await params).id, 'GET'); }
export async function PUT(request: Request, { params }: Context) { return forwardPortfolioAdminUpdate(request, 'stories', (await params).id); }
export async function DELETE(request: Request, { params }: Context) { return forwardPortfolioAdminDelete(request, 'stories', (await params).id); }
