import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getLanternRepo } from '@/server/db';
import { isAdminAuthorized } from '@/server/crypto';

export const dynamic = 'force-dynamic';

const UpdateReplyStatusSchema = z.object({
  id: z.string().min(1),
  status: z.enum(['active', 'hidden_by_report', 'deleted_by_admin']),
});

export async function GET(req: NextRequest) {
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const filter = searchParams.get('filter') === 'reported' ? 'reported' : 'all';
  const repo = getLanternRepo();
  const replies = await repo.adminListReplies(filter);
  return NextResponse.json({ replies });
}

export async function PATCH(req: NextRequest) {
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = await req.json();
  const parsed = UpdateReplyStatusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }
  const repo = getLanternRepo();
  const updated = await repo.adminUpdateReplyStatus(parsed.data.id, parsed.data.status);
  if (!updated) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ updated: true });
}
