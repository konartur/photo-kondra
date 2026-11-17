import { NextResponse } from 'next/server';
import { forwardPublicRequest } from '@/lib/api/public-server';

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // Bound public input before forwarding; the API performs authoritative DTO validation.
  try {
    const reader = request.body?.getReader();
    if (!reader) return NextResponse.json({ message: 'Selection is required' }, { status: 400 });
    const decoder = new TextDecoder();
    let text = '';
    let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 25000) {
          await reader.cancel();
          return NextResponse.json({ message: 'Selection is too large' }, { status: 413 });
        }
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
    } finally {
      reader.releaseLock();
    }
    const body: unknown = JSON.parse(text);
    return forwardPublicRequest(
      `/public/galleries/${encodeURIComponent(token)}/archives`,
      'POST',
      JSON.stringify(body),
    );
  } catch {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });
  }
}
