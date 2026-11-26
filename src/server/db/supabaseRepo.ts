import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  AdminLanternItem,
  AdminReplyItem,
  BlessingType,
  LanternCreateInput,
  LanternItem,
  LanternStatus,
  LanternType,
  Locale,
  MoodKey,
  ReplyItem,
  ReplyStatus,
  ReportReason,
} from '@/types/lantern';
import { generateId, sha256 } from '@/server/crypto';
import type { LanternRepository } from './types';

const AUTO_HIDE_REPORT_THRESHOLD = 3;

function mapLantern(row: Record<string, unknown>): LanternItem {
  return {
    id: String(row.id),
    type: row.type as LanternType,
    mood: row.mood as MoodKey,
    content: String(row.content),
    nickname: row.nickname ? String(row.nickname) : null,
    stickerId: row.sticker_id ? String(row.sticker_id) : null,
    imageUrl: row.image_url ? String(row.image_url) : null,
    allowReplies: Boolean(row.allow_replies),
    blessWishCount: Number(row.bless_wish_count ?? 0),
    blessHugCount: Number(row.bless_hug_count ?? 0),
    blessNewyearCount: Number(row.bless_newyear_count ?? 0),
    replyCount: Number(row.reply_count ?? 0),
    status: row.status as LanternStatus,
    reportCount: Number(row.report_count ?? 0),
    locale: (row.locale === 'en' ? 'en' : 'zh') as Locale,
    createdAt: String(row.created_at),
  };
}

function mapReply(row: Record<string, unknown>): ReplyItem {
  return {
    id: String(row.id),
    lanternId: String(row.lantern_id),
    content: String(row.content),
    nickname: row.nickname ? String(row.nickname) : null,
    status: row.status as ReplyStatus,
    reportCount: Number(row.report_count ?? 0),
    createdAt: String(row.created_at),
  };
}

/**
 * Production Supabase PostgreSQL adapter (strictly server-side only).
 * Mainland China clients communicate only with our own domain API routes.
 */
export class SupabaseLanternRepository implements LanternRepository {
  private readonly client: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.client = createClient(url, serviceRoleKey, {
      auth: { persistSession: false },
    });
  }

  async listSkyLanterns(params: {
    limit: number;
    myIds: string[];
    excludeIds?: string[];
    shuffle?: boolean;
  }): Promise<LanternItem[]> {
    const limit = Math.max(1, Math.min(50, params.limit));
    const result: LanternItem[] = [];
    const seen = new Set<string>();

    if (params.myIds.length > 0) {
      const { data: mine } = await this.client
        .from('lanterns')
        .select('*')
        .eq('status', 'active')
        .in('id', params.myIds.slice(0, 20))
        .order('created_at', { ascending: false });

      for (const row of mine ?? []) {
        const item = { ...mapLantern(row), isMine: true };
        result.push(item);
        seen.add(item.id);
      }
    }

    const fetchSize = params.shuffle ? 120 : limit + seen.size;
    const { data: pool } = await this.client
      .from('lanterns')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(fetchSize);

    const rows = [...(pool ?? [])];
    if (params.shuffle) {
      for (let i = rows.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rows[i], rows[j]] = [rows[j], rows[i]];
      }
    }

    const excludeSet = new Set(params.excludeIds ?? []);
    const ordered =
      params.shuffle && excludeSet.size > 0
        ? [
            ...rows.filter((r) => !excludeSet.has(String(r.id))),
            ...rows.filter((r) => excludeSet.has(String(r.id))),
          ]
        : rows;

    for (const row of ordered) {
      const id = String(row.id);
      if (seen.has(id)) continue;
      result.push(mapLantern(row));
      seen.add(id);
      if (result.length >= limit) break;
    }

    return result;
  }

  async getLanternById(id: string): Promise<LanternItem | null> {
    const { data } = await this.client
      .from('lanterns')
      .select('*')
      .eq('id', id)
      .eq('status', 'active')
      .maybeSingle();
    return data ? mapLantern(data) : null;
  }

  async listLanternsByIds(ids: string[]): Promise<LanternItem[]> {
    if (ids.length === 0) return [];
    const { data } = await this.client
      .from('lanterns')
      .select('*')
      .eq('status', 'active')
      .in('id', ids.slice(0, 50))
      .order('created_at', { ascending: false });
    return (data ?? []).map((r) => ({ ...mapLantern(r), isMine: true }));
  }

  async createLantern(input: LanternCreateInput, ipHash: string): Promise<LanternItem> {
    const id = generateId();
    const createdAt = new Date().toISOString();
    const payload = {
      id,
      type: input.type,
      mood: input.mood,
      content: input.content.trim(),
      nickname: input.nickname?.trim() || null,
      sticker_id: input.stickerId || null,
      image_url: input.imageUrl || null,
      allow_replies: input.allowReplies,
      owner_secret_hash: sha256(input.ownerSecret),
      bless_wish_count: 0,
      bless_hug_count: 0,
      bless_newyear_count: 0,
      reply_count: 0,
      status: 'active',
      report_count: 0,
      locale: input.locale,
      ip_hash: ipHash,
      created_at: createdAt,
    };
    const { error } = await this.client.from('lanterns').insert(payload);
    if (error) throw new Error(error.message);
    return { ...mapLantern(payload), isMine: true };
  }

  async deleteLanternByOwner(
    id: string,
    ownerSecret: string
  ): Promise<{ deleted: boolean; imageUrl?: string | null }> {
    const { data } = await this.client
      .from('lanterns')
      .select('owner_secret_hash, image_url')
      .eq('id', id)
      .neq('status', 'deleted_by_owner')
      .maybeSingle();

    if (!data || String(data.owner_secret_hash) !== sha256(ownerSecret)) {
      return { deleted: false };
    }

    await this.client
      .from('lanterns')
      .update({ status: 'deleted_by_owner' })
      .eq('id', id);

    return {
      deleted: true,
      imageUrl: data.image_url ? String(data.image_url) : null,
    };
  }

  async listReplies(lanternId: string): Promise<ReplyItem[]> {
    const { data } = await this.client
      .from('replies')
      .select('*')
      .eq('lantern_id', lanternId)
      .eq('status', 'active')
      .order('created_at', { ascending: true });
    return (data ?? []).map(mapReply);
  }

  async createReply(
    lanternId: string,
    input: { content: string; nickname?: string },
    ipHash: string
  ): Promise<{ reply?: ReplyItem; error?: 'not_found' | 'replies_disabled' }> {
    const { data: lantern } = await this.client
      .from('lanterns')
      .select('id, allow_replies, reply_count')
      .eq('id', lanternId)
      .eq('status', 'active')
      .maybeSingle();

    if (!lantern) return { error: 'not_found' };
    if (!lantern.allow_replies) return { error: 'replies_disabled' };

    const id = generateId();
    const createdAt = new Date().toISOString();
    const row = {
      id,
      lantern_id: lanternId,
      content: input.content.trim(),
      nickname: input.nickname?.trim() || null,
      status: 'active',
      report_count: 0,
      ip_hash: ipHash,
      created_at: createdAt,
    };

    const { error } = await this.client.from('replies').insert(row);
    if (error) throw new Error(error.message);

    await this.client
      .from('lanterns')
      .update({ reply_count: Number(lantern.reply_count ?? 0) + 1 })
      .eq('id', lanternId);

    return { reply: mapReply(row) };
  }

  async addBlessing(lanternId: string, blessing: BlessingType): Promise<LanternItem | null> {
    const current = await this.getLanternById(lanternId);
    if (!current) return null;

    const patch =
      blessing === 'wish'
        ? { bless_wish_count: current.blessWishCount + 1 }
        : blessing === 'hug'
        ? { bless_hug_count: current.blessHugCount + 1 }
        : { bless_newyear_count: current.blessNewyearCount + 1 };

    const { data } = await this.client
      .from('lanterns')
      .update(patch)
      .eq('id', lanternId)
      .eq('status', 'active')
      .select('*')
      .maybeSingle();
    return data ? mapLantern(data) : null;
  }

  async submitReport(params: {
    targetType: 'lantern' | 'reply';
    targetId: string;
    reason: ReportReason;
    reporterHash: string;
  }): Promise<{ accepted: boolean; hiddenTriggered: boolean; reportCount: number }> {
    const table = params.targetType === 'lantern' ? 'lanterns' : 'replies';
    const { data: target } = await this.client
      .from(table)
      .select('id, report_count, status')
      .eq('id', params.targetId)
      .maybeSingle();

    if (!target) return { accepted: false, hiddenTriggered: false, reportCount: 0 };

    const { error: insertErr } = await this.client.from('reports').insert({
      id: generateId(),
      target_type: params.targetType,
      target_id: params.targetId,
      reason: params.reason,
      reporter_hash: params.reporterHash,
      created_at: new Date().toISOString(),
    });

    if (insertErr) {
      return {
        accepted: false,
        hiddenTriggered: false,
        reportCount: Number(target.report_count ?? 0),
      };
    }

    const nextCount = Number(target.report_count ?? 0) + 1;
    const shouldHide =
      nextCount >= AUTO_HIDE_REPORT_THRESHOLD && target.status === 'active';

    await this.client
      .from(table)
      .update(
        shouldHide
          ? { report_count: nextCount, status: 'hidden_by_report' }
          : { report_count: nextCount }
      )
      .eq('id', params.targetId);

    return { accepted: true, hiddenTriggered: shouldHide, reportCount: nextCount };
  }

  async isIpBanned(ipHash: string): Promise<boolean> {
    const { data } = await this.client
      .from('banned_ips')
      .select('ip_hash')
      .eq('ip_hash', ipHash)
      .maybeSingle();
    return Boolean(data);
  }

  async adminListLanterns(
    filter: 'all' | 'reported' | 'images'
  ): Promise<AdminLanternItem[]> {
    let query = this.client
      .from('lanterns')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(120);

    if (filter === 'reported') {
      query = query.or('report_count.gt.0,status.eq.hidden_by_report');
    } else if (filter === 'images') {
      query = query.not('image_url', 'is', null);
    }

    const { data } = await query;
    return (data ?? []).map((r) => ({ ...mapLantern(r), ipHash: String(r.ip_hash) }));
  }

  async adminListReplies(filter: 'all' | 'reported'): Promise<AdminReplyItem[]> {
    let query = this.client
      .from('replies')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(120);

    if (filter === 'reported') {
      query = query.or('report_count.gt.0,status.eq.hidden_by_report');
    }
    const { data } = await query;
    return (data ?? []).map((r) => ({ ...mapReply(r), ipHash: String(r.ip_hash) }));
  }

  async adminUpdateLanternStatus(
    id: string,
    status: LanternStatus
  ): Promise<{ updated: boolean; imageUrl?: string | null }> {
    const { data: existing } = await this.client
      .from('lanterns')
      .select('image_url')
      .eq('id', id)
      .maybeSingle();
    if (!existing) return { updated: false };

    await this.client
      .from('lanterns')
      .update(status === 'active' ? { status, report_count: 0 } : { status })
      .eq('id', id);

    return {
      updated: true,
      imageUrl: existing.image_url ? String(existing.image_url) : null,
    };
  }

  async adminUpdateReplyStatus(id: string, status: ReplyStatus): Promise<boolean> {
    const { error } = await this.client
      .from('replies')
      .update(status === 'active' ? { status, report_count: 0 } : { status })
      .eq('id', id);
    return !error;
  }

  async adminBanIp(ipHash: string, reason = 'admin'): Promise<void> {
    await this.client.from('banned_ips').upsert({
      ip_hash: ipHash,
      reason,
      created_at: new Date().toISOString(),
    });
  }
}
