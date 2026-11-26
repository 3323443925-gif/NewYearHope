import { NextRequest, NextResponse } from 'next/server';
import { getClientIpHash } from '@/server/crypto';
import { checkRateLimit } from '@/server/rateLimit';
import { moderateImageBuffer } from '@/server/moderation';
import { saveUploadedImage } from '@/server/storage';
import { getLanternRepo } from '@/server/db';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const ipHash = getClientIpHash(req);
    const repo = getLanternRepo();
    if (await repo.isIpBanned(ipHash)) {
      return NextResponse.json({ error: 'image_blocked' }, { status: 403 });
    }

    if (!checkRateLimit({ key: `upload:${ipHash}`, limit: 6, windowMs: 60_000 })) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
    }

    const formData = await req.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'missing_file' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const check = await moderateImageBuffer(buffer);
    if (!check.allowed || !check.format) {
      return NextResponse.json(
        { error: 'image_blocked', reason: check.reason },
        { status: 422 }
      );
    }

    const saved = await saveUploadedImage(buffer, check.format);
    return NextResponse.json({ url: saved.url, key: saved.key }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/upload]', err);
    return NextResponse.json({ error: 'upload_failed' }, { status: 500 });
  }
}
