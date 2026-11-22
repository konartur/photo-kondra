import { forwardPublishedPortfolioDerivative } from '@/lib/api/portfolio-media-server';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ mediaId: string; variantId: string }> },
) {
  const { mediaId, variantId } = await params;
  return forwardPublishedPortfolioDerivative(mediaId, variantId);
}
