import { forwardPortfolioAdminCreate, forwardPortfolioAdminList } from '@/lib/api/portfolio-admin-server';
export async function GET(request: Request) { return forwardPortfolioAdminList('stories', new URL(request.url).search); }
export async function POST(request: Request) { return forwardPortfolioAdminCreate(request, 'stories'); }
