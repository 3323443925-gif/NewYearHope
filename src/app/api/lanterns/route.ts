import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getLanternRepo } from '@/server/db';
import { getClientIpHash } from '@/server/crypto';
import { checkRateLimit } from '@/server/rateLimit';
import { moderateText } from '@/server/moderation';

export const dynamic = 'force-dynamic';

const CreateLanternSchema = z.object({
  type: z.enum(['wish', 'unspoken', 'greeting']),
  mood: z.enum(['hopeful', 'missing', 'relieved', 'lonely', 'grateful', 'encouraging']),
  content: z.string().trim().min(1).max(500),
  nickname: z.string().trim().max(20).optional().default(''),
  stickerId: z.string().max(40).nullable().optional().default(null),
  imageUrl: z
    .string()
    .regex(/^\/api\/media\/[a-zA-Z0-9_-]+\.(webp|png|jpeg|jpg)$/)
    .nullable()
    .optional()
    .default(null),
  allowReplies: z.boolean().default(true),
  locale: z.enum(['zh', 'en']).default('zh'),
  ownerSecret: z.string().min(16).max(128),
});

export async function GET(req: NextRequest) {
  try {
    const repo = getLanternRepo();
    const { searchParams } = new URL(req.url);
    const idsParam = searchParams.get('ids');

    if (idsParam) {
      const ids = idsParam
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const lanterns = await repo.listLanternsByIds(ids);
      return NextResponse.json({ lanterns });
    }

    const limit = Math.min(50, Math.max(1, Number(searchParams.get('limit') || 16)));
    const myIds = (searchParams.get('myIds') || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const excludeIds = (searchParams.get('excludeIds') || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const shuffle = searchParams.get('shuffle') === '1';

    const lanterns = await repo.listSkyLanterns({ limit, myIds, excludeIds, shuffle });
    return NextResponse.json({ lanterns });
  } catch (err) {
    console.error('[GET /api/lanterns]', err);
    return NextResponse.json({ error: 'failed_to_load' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const repo = getLanternRepo();
    const ipHash = getClientIpHash(req);

    if (await repo.isIpBanned(ipHash)) {
      return NextResponse.json({ error: 'moderation_blocked' }, { status: 403 });
    }

    const body = await req.json();
    const parsed = CreateLanternSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid_input', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const perMinOk = checkRateLimit({
      key: `lantern:min:${ipHash}`,
      limit: 3,
      windowMs: 60_000,
    });
    const perHourOk = checkRateLimit({
      key: `lantern:hr:${ipHash}`,
      limit: 12,
      windowMs: 3600_000,
    });
    if (!perMinOk || !perHourOk) {
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

    const lantern = await repo.createLantern(parsed.data, ipHash);
    return NextResponse.json(
      {
        lantern,
        crisisSupport: Boolean(mod.crisisSupport),
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('[POST /api/lanterns]', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
