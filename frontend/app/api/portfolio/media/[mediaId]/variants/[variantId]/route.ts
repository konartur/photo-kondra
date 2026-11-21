import { forwardPortfolioPreview } from '@/lib/api/portfolio-media-server';

interface Context {
  params: Promise<{ mediaId: string; variantId: string }>;
}
export async function GET(_request: Request, { params }: Context) {
  const { mediaId, variantId } = await params;
  return forwardPortfolioPreview(mediaId, variantId);
}
