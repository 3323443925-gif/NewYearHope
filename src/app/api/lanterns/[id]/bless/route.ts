import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getLanternRepo } from '@/server/db';
import { getClientIpHash } from '@/server/crypto';
import { checkRateLimit } from '@/server/rateLimit';

export const dynamic = 'force-dynamic';

const BlessSchema = z.object({
  type: z.enum(['wish', 'hug', 'newyear']),
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const ipHash = getClientIpHash(req);
    if (!checkRateLimit({ key: `bless:${ipHash}`, limit: 30, windowMs: 60_000 })) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
    }

    const body = await req.json();
    const parsed = BlessSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
    }

    const repo = getLanternRepo();
    const updated = await repo.addBlessing(id, parsed.data.type);
    if (!updated) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    return NextResponse.json({ lantern: updated });
  } catch (err) {
    console.error('[POST /api/lanterns/[id]/bless]', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
