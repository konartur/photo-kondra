import { forwardPortfolioMedia } from '@/lib/api/portfolio-media-server';

interface Context {
  params: Promise<{ mediaId: string }>;
}
export async function GET(_request: Request, { params }: Context) {
  return forwardPortfolioMedia((await params).mediaId);
}
export async function DELETE(_request: Request, { params }: Context) {
  return forwardPortfolioMedia((await params).mediaId, 'DELETE');
}
