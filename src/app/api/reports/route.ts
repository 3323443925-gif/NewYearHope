import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getLanternRepo } from '@/server/db';
import { getClientIpHash, saltedHash } from '@/server/crypto';
import { checkRateLimit } from '@/server/rateLimit';

export const dynamic = 'force-dynamic';

const ReportSchema = z.object({
  targetType: z.enum(['lantern', 'reply']),
  targetId: z.string().min(1).max(100),
  reason: z.enum(['spam', 'unkind', 'inappropriate_image', 'other']),
  reporterId: z.string().min(4).max(128).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const ipHash = getClientIpHash(req);
    if (!checkRateLimit({ key: `report:${ipHash}`, limit: 10, windowMs: 60_000 })) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
    }

    const body = await req.json();
    const parsed = ReportSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
    }

    const reporterHash = parsed.data.reporterId
      ? saltedHash(`${ipHash}:${parsed.data.reporterId}`)
      : ipHash;

    const repo = getLanternRepo();
    const result = await repo.submitReport({
      targetType: parsed.data.targetType,
      targetId: parsed.data.targetId,
      reason: parsed.data.reason,
      reporterHash,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error('[POST /api/reports]', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
