import { forwardPortfolioMediaList } from '@/lib/api/portfolio-media-server';

export async function GET(request: Request) {
  return forwardPortfolioMediaList(new URL(request.url).search);
}
