import { forwardPortfolioLifecycle } from '@/lib/api/portfolio-admin-server';
export async function POST(request: Request) { return forwardPortfolioLifecycle(request, 'settings', 'archive'); }
