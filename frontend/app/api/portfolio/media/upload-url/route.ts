import { forwardPortfolioUpload } from '@/lib/api/portfolio-media-server';

export async function POST(request: Request) {
  return forwardPortfolioUpload(request);
}
