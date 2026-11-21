import { forwardPortfolioDraftPreview } from '@/lib/api/portfolio-admin-server';
export async function GET(request: Request) { return forwardPortfolioDraftPreview('settings', new URL(request.url).search); }
