import { forwardPortfolioMedia } from '@/lib/api/portfolio-media-server';

interface Context {
  params: Promise<{ mediaId: string }>;
}
export async function POST(_request: Request, { params }: Context) {
  return forwardPortfolioMedia((await params).mediaId, 'POST', 'retry');
}
