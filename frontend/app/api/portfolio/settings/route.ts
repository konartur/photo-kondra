import { forwardPortfolioSettings } from '@/lib/api/portfolio-admin-server';
export async function GET() { return forwardPortfolioSettings(); }
export async function PUT(request: Request) { return forwardPortfolioSettings(request); }
