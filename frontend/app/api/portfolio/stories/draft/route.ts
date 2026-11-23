import { forwardPortfolioAdminCreate } from '@/lib/api/portfolio-admin-server';

export async function POST(request: Request) {
  return forwardPortfolioAdminCreate(request, 'stories', '/draft');
}
