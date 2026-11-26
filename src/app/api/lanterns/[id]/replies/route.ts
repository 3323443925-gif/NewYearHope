import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getLanternRepo } from '@/server/db';
import { getClientIpHash } from '@/server/crypto';
import { checkRateLimit } from '@/server/rateLimit';
import { moderateText } from '@/server/moderation';

export const dynamic = 'force-dynamic';

const CreateReplySchema = z.object({
  content: z.string().trim().min(1).max(300),
  nickname: z.string().trim().max(20).optional().default(''),
});

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const repo = getLanternRepo();
    const replies = await repo.listReplies(id);
    return NextResponse.json({ replies });
  } catch (err) {
    console.error('[GET /api/lanterns/[id]/replies]', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const repo = getLanternRepo();
    const ipHash = getClientIpHash(req);

    if (await repo.isIpBanned(ipHash)) {
      return NextResponse.json({ error: 'moderation_blocked' }, { status: 403 });
    }

    const body = await req.json();
    const parsed = CreateReplySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
    }

    const ok = checkRateLimit({
      key: `reply:min:${ipHash}`,
      limit: 5,
      windowMs: 60_000,
    });
    if (!ok) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
    }

    const textToCheck = `${parsed.data.nickname} ${parsed.data.content}`.trim();
    const mod = await moderateText(textToCheck);
    if (!mod.allowed) {
      return NextResponse.json(
        { error: 'moderation_blocked', reason: mod.reason },
        { status: 422 }
      );
    }

    const result = await repo.createReply(id, parsed.data, ipHash);
    if (result.error === 'not_found') {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (result.error === 'replies_disabled') {
      return NextResponse.json({ error: 'replies_disabled' }, { status: 403 });
    }

    return NextResponse.json(
      {
        reply: result.reply,
        crisisSupport: Boolean(mod.crisisSupport),
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('[POST /api/lanterns/[id]/replies]', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
