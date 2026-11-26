import { NextRequest, NextResponse } from 'next/server';
import { getLanternRepo } from '@/server/db';
import { deleteUploadedImageByUrl } from '@/server/storage';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const repo = getLanternRepo();
  const lantern = await repo.getLanternById(id);
  if (!lantern) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ lantern });
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const ownerSecret = req.headers.get('x-owner-secret') || '';
    if (!ownerSecret || ownerSecret.length < 16) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const repo = getLanternRepo();
    const result = await repo.deleteLanternByOwner(id, ownerSecret);
    if (!result.deleted) {
      return NextResponse.json({ error: 'forbidden_or_not_found' }, { status: 403 });
    }

    await deleteUploadedImageByUrl(result.imageUrl);
    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error('[DELETE /api/lanterns/[id]]', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
