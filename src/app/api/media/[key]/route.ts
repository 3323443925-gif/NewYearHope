import { NextRequest, NextResponse } from 'next/server';
import { readUploadedImage } from '@/server/storage';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ key: string }> }
) {
  const { key } = await context.params;
  const result = await readUploadedImage(key);
  if (!result) {
    return new NextResponse('Not Found', { status: 404 });
  }

  return new NextResponse(new Uint8Array(result.buffer), {
    status: 200,
    headers: {
      'Content-Type': result.contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
