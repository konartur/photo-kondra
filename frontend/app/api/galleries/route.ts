import { forwardAdminRequest } from '@/lib/api/server';

export async function GET() {
  return forwardAdminRequest('/galleries');
}

export async function POST(request: Request) {
  return forwardAdminRequest('/galleries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: await request.text(),
  });
}
