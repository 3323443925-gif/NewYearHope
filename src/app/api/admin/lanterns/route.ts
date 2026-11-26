import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getLanternRepo } from '@/server/db';
import { isAdminAuthorized } from '@/server/crypto';
import { deleteUploadedImageByUrl } from '@/server/storage';

export const dynamic = 'force-dynamic';

const UpdateStatusSchema = z.object({
  id: z.string().min(1),
  status: z.enum(['active', 'hidden_by_report', 'deleted_by_admin']),
});

const BanIpSchema = z.object({
  ipHash: z.string().min(4),
  reason: z.string().max(120).optional(),
});

export async function GET(req: NextRequest) {
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const rawFilter = searchParams.get('filter');
  const filter =
    rawFilter === 'reported' || rawFilter === 'images' ? rawFilter : 'all';

  const repo = getLanternRepo();
  const lanterns = await repo.adminListLanterns(filter);
  return NextResponse.json({ lanterns });
}

export async function PATCH(req: NextRequest) {
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = await req.json();
  const parsed = UpdateStatusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }

  const repo = getLanternRepo();
  const res = await repo.adminUpdateLanternStatus(parsed.data.id, parsed.data.status);
  if (!res.updated) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (parsed.data.status === 'deleted_by_admin') {
    await deleteUploadedImageByUrl(res.imageUrl);
  }
  return NextResponse.json({ updated: true });
}

export async function POST(req: NextRequest) {
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = await req.json();
  const parsed = BanIpSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }
  const repo = getLanternRepo();
  await repo.adminBanIp(parsed.data.ipHash, parsed.data.reason);
  return NextResponse.json({ banned: true });
}
