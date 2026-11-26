import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import type {
  AdminLanternItem,
  AdminReplyItem,
  BlessingType,
  LanternCreateInput,
  LanternItem,
  LanternStatus,
  Locale,
  MoodKey,
  LanternType,
  ReplyItem,
  ReplyStatus,
  ReportReason,
} from '@/types/lantern';
import { generateId, sha256 } from '@/server/crypto';
import type { LanternRepository } from './types';

const AUTO_HIDE_REPORT_THRESHOLD = 3;

interface SqliteDatabaseLike {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: unknown[]): { changes: number };
    get(...params: unknown[]): Record<string, unknown> | undefined;
    all(...params: unknown[]): Record<string, unknown>[];
  };
}

function loadSqliteDatabaseSync(): new (location: string) => SqliteDatabaseLike {
  const req = createRequire(import.meta.url);
  const mod = req('node:sqlite') as {
    DatabaseSync: new (location: string) => SqliteDatabaseLike;
  };
  return mod.DatabaseSync;
}

const SEED_LANTERNS: Array<{
  type: LanternType;
  mood: MoodKey;
  content: string;
  nickname: string | null;
  stickerId: string;
  locale: Locale;
  blessWish: number;
  blessHug: number;
  blessNewyear: number;
}> = [
  {
    type: 'wish',
    mood: 'hopeful',
    content: '愿 2027 年家人平安健康，自己也能鼓起勇气去做一直想做的小事。慢一点没关系，只要在向前走就好。',
    nickname: '林间微雪',
    stickerId: 'sky-lantern',
    locale: 'zh',
    blessWish: 12,
    blessHug: 4,
    blessNewyear: 9,
  },
  {
    type: 'unspoken',
    mood: 'missing',
    content: '今年秋天路过我们曾一起喝热可可的那条街，突然很想问你过得好不好。虽然没有发出那条消息，但真心祝你新的一年被温柔对待。',
    nickname: null,
    stickerId: 'hot-cocoa',
    locale: 'zh',
    blessWish: 7,
    blessHug: 16,
    blessNewyear: 5,
  },
  {
    type: 'greeting',
    mood: 'encouraging',
    content: 'Hello from a quiet winter evening! Wherever you are in the world right now, I hope a warm cup of tea and a gentle 2027 find you soon.',
    nickname: 'Clara',
    stickerId: 'north-star',
    locale: 'en',
    blessWish: 8,
    blessHug: 6,
    blessNewyear: 14,
  },
  {
    type: 'unspoken',
    mood: 'lonely',
    content: '一个人在异乡加班到深夜，点开这片蓝色夜空突然松了一口气。谢谢在这里路过的每一个陌生人，祝我们新的一年都能睡个好觉。',
    nickname: '夜航船',
    stickerId: 'crescent-moon',
    locale: 'zh',
    blessWish: 9,
    blessHug: 19,
    blessNewyear: 7,
  },
  {
    type: 'wish',
    mood: 'grateful',
    content: 'Thank you, 2026, for teaching me how to be kinder to myself. Wishing everyone reading this light a peaceful, bright start to January.',
    nickname: 'Kenji',
    stickerId: 'snow-pine',
    locale: 'en',
    blessWish: 11,
    blessHug: 5,
    blessNewyear: 10,
  },
  {
    type: 'greeting',
    mood: 'relieved',
    content: '把今年所有的遗憾和叹气都折成纸飞机放走吧。零点烟花升起的时候，我们都轻装上阵！新年快乐，远方的朋友。',
    nickname: '阿满',
    stickerId: 'paper-plane',
    locale: 'zh',
    blessWish: 6,
    blessHug: 8,
    blessNewyear: 15,
  },
  {
    type: 'wish',
    mood: 'hopeful',
    content: 'May 2027 bring unexpected laughter, soft mornings, and the courage to say "I care about you" out loud before it gets too late.',
    nickname: null,
    stickerId: 'wish-jar',
    locale: 'en',
    blessWish: 10,
    blessHug: 7,
    blessNewyear: 8,
  },
  {
    type: 'greeting',
    mood: 'grateful',
    content: '给此刻刚好点开这盏灯的你：不管今天有多累，你已经做得很好了。新年将至，抱抱你，愿你眼底常有星光。',
    nickname: '橘子汽水',
    stickerId: 'warm-cat',
    locale: 'zh',
    blessWish: 5,
    blessHug: 21,
    blessNewyear: 11,
  },
];

const EXTRA_SEED_LANTERNS: Array<{
  id: string;
  type: LanternType;
  mood: MoodKey;
  content: string;
  nickname: string | null;
  stickerId: string;
  locale: Locale;
  blessWish: number;
  blessHug: number;
  blessNewyear: number;
}> = [
  {
    id: 'seed-extra-01',
    type: 'wish',
    mood: 'hopeful',
    content: '希望 2027 年能够去一次海边看日出，把这一年攒下的疲惫全都吹散在海风里。',
    nickname: '听海的人',
    stickerId: 'crescent-moon',
    locale: 'zh',
    blessWish: 9,
    blessHug: 3,
    blessNewyear: 7,
  },
  {
    id: 'seed-extra-02',
    type: 'unspoken',
    mood: 'missing',
    content: '外婆，今年的初雪下得很轻。我学会了你以前教我煮的姜茶，冬天没有那么冷了，我很想你。',
    nickname: '小禾',
    stickerId: 'hot-cocoa',
    locale: 'zh',
    blessWish: 6,
    blessHug: 24,
    blessNewyear: 4,
  },
  {
    id: 'seed-extra-03',
    type: 'greeting',
    mood: 'encouraging',
    content: 'To whoever is quietly scrolling at 2 AM: you survived 100% of your hardest days. Here is to gentler mornings in 2027.',
    nickname: 'Maya',
    stickerId: 'north-star',
    locale: 'en',
    blessWish: 13,
    blessHug: 17,
    blessNewyear: 11,
  },
  {
    id: 'seed-extra-04',
    type: 'wish',
    mood: 'relieved',
    content: '不再为了迎合别人而委屈自己，2027 年请多爱自己一点，做一只晒太阳的懒猫。',
    nickname: '糯米团子',
    stickerId: 'warm-cat',
    locale: 'zh',
    blessWish: 15,
    blessHug: 8,
    blessNewyear: 10,
  },
  {
    id: 'seed-extra-05',
    type: 'unspoken',
    mood: 'lonely',
    content: 'Sometimes moving to a brand-new city feels like floating in space. Seeing these warm lanterns makes tonight feel a little less far from home.',
    nickname: 'Daniel',
    stickerId: 'sky-lantern',
    locale: 'en',
    blessWish: 7,
    blessHug: 15,
    blessNewyear: 6,
  },
  {
    id: 'seed-extra-06',
    type: 'greeting',
    mood: 'grateful',
    content: '谢谢今年在地铁上扶过我一把的阿姨，谢谢下雨天借我伞的同事。世界很好，祝大家都新年快乐！',
    nickname: '向日葵',
    stickerId: 'snowflake',
    locale: 'zh',
    blessWish: 8,
    blessHug: 11,
    blessNewyear: 18,
  },
  {
    id: 'seed-extra-07',
    type: 'wish',
    mood: 'encouraging',
    content: '考研/求职的每一步都很沉重，但我还是相信天道酬勤。愿一月收到期待已久的好消息！',
    nickname: '追光者',
    stickerId: 'paper-plane',
    locale: 'zh',
    blessWish: 22,
    blessHug: 9,
    blessNewyear: 12,
  },
  {
    id: 'seed-extra-08',
    type: 'unspoken',
    mood: 'relieved',
    content: 'I never got to say a proper goodbye before we drifted apart, so I am letting it go gently under these stars. Be happy.',
    nickname: null,
    stickerId: 'wish-jar',
    locale: 'en',
    blessWish: 5,
    blessHug: 14,
    blessNewyear: 4,
  },
  {
    id: 'seed-extra-09',
    type: 'greeting',
    mood: 'hopeful',
    content: '无论你现在在地球的哪一个时区，当你的时钟走到零点、烟花升起的那一秒，我都在这里祝你新年快乐！',
    nickname: '守灯人',
    stickerId: 'snowman',
    locale: 'zh',
    blessWish: 14,
    blessHug: 10,
    blessNewyear: 26,
  },
  {
    id: 'seed-extra-10',
    type: 'wish',
    mood: 'grateful',
    content: 'May our small acts of kindness ripple across oceans in 2027. Peace, health, and warm soup to every home.',
    nickname: 'Elena',
    stickerId: 'snow-pine',
    locale: 'en',
    blessWish: 11,
    blessHug: 7,
    blessNewyear: 13,
  },
];

function rowToLantern(row: Record<string, unknown>): LanternItem {
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

function rowToReply(row: Record<string, unknown>): ReplyItem {
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

export class SqliteLanternRepository implements LanternRepository {
  private readonly db: SqliteDatabaseLike;

  constructor(dbPath?: string, seedIfEmpty = true) {
    const resolvedPath =
      dbPath ?? path.join(process.cwd(), '.data', 'starlight.db');
    if (resolvedPath !== ':memory:') {
      fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
    }
    const DatabaseSync = loadSqliteDatabaseSync();
    this.db = new DatabaseSync(resolvedPath);
    this.initSchema();
    if (seedIfEmpty) {
      this.seedIfNeeded();
    }
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS lanterns (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        mood TEXT NOT NULL,
        content TEXT NOT NULL,
        nickname TEXT,
        sticker_id TEXT,
        image_url TEXT,
        allow_replies INTEGER NOT NULL DEFAULT 1,
        owner_secret_hash TEXT NOT NULL,
        bless_wish_count INTEGER NOT NULL DEFAULT 0,
        bless_hug_count INTEGER NOT NULL DEFAULT 0,
        bless_newyear_count INTEGER NOT NULL DEFAULT 0,
        reply_count INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'active',
        report_count INTEGER NOT NULL DEFAULT 0,
        locale TEXT NOT NULL DEFAULT 'zh',
        ip_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_lanterns_status_created ON lanterns(status, created_at DESC);

      CREATE TABLE IF NOT EXISTS replies (
        id TEXT PRIMARY KEY,
        lantern_id TEXT NOT NULL,
        content TEXT NOT NULL,
        nickname TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        report_count INTEGER NOT NULL DEFAULT 0,
        ip_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_replies_lantern_status ON replies(lantern_id, status, created_at ASC);

      CREATE TABLE IF NOT EXISTS reports (
        id TEXT PRIMARY KEY,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        reason TEXT NOT NULL,
        reporter_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(target_type, target_id, reporter_hash)
      );

      CREATE TABLE IF NOT EXISTS banned_ips (
        ip_hash TEXT PRIMARY KEY,
        reason TEXT,
        created_at TEXT NOT NULL
      );
    `);
  }

  private seedIfNeeded(): void {
    const row = this.db.prepare(`SELECT COUNT(*) as cnt FROM lanterns`).get();
    const now = Date.now();

    if (Number(row?.cnt ?? 0) === 0) {
      const insertLantern = this.db.prepare(`
        INSERT INTO lanterns (
          id, type, mood, content, nickname, sticker_id, image_url,
          allow_replies, owner_secret_hash, bless_wish_count, bless_hug_count,
          bless_newyear_count, reply_count, status, report_count, locale, ip_hash, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, NULL, 1, ?, ?, ?, ?, ?, 'active', 0, ?, 'seed', ?)
      `);

      const insertReply = this.db.prepare(`
        INSERT INTO replies (id, lantern_id, content, nickname, status, report_count, ip_hash, created_at)
        VALUES (?, ?, ?, ?, 'active', 0, 'seed', ?)
      `);

      SEED_LANTERNS.forEach((seed, idx) => {
        const id = generateId();
        const createdAt = new Date(now - (idx + 1) * 3600_000 * 3).toISOString();
        const withStarterReply = idx === 1 || idx === 3;
        insertLantern.run(
          id,
          seed.type,
          seed.mood,
          seed.content,
          seed.nickname,
          seed.stickerId,
          sha256(`seed-secret-${idx}`),
          seed.blessWish,
          seed.blessHug,
          seed.blessNewyear,
          withStarterReply ? 1 : 0,
          seed.locale,
          createdAt
        );
        if (withStarterReply) {
          insertReply.run(
            generateId(),
            id,
            idx === 1
              ? '这份没说出口的温柔，风会替你轻轻带到的。新年也要照顾好自己呀。'
              : '辛苦啦夜航船！虽然素未谋面，但今晚这片星光陪着你，早点休息，新年快乐 🤍',
            idx === 1 ? '路过的星光' : '暖冬',
            new Date(now - 3600_000).toISOString()
          );
        }
      });
    }

    // Ensure rich rotating starter sky pool (idempotent via INSERT OR IGNORE)
    const insertExtra = this.db.prepare(`
      INSERT OR IGNORE INTO lanterns (
        id, type, mood, content, nickname, sticker_id, image_url,
        allow_replies, owner_secret_hash, bless_wish_count, bless_hug_count,
        bless_newyear_count, reply_count, status, report_count, locale, ip_hash, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, 1, ?, ?, ?, ?, 0, 'active', 0, ?, 'seed', ?)
    `);
    EXTRA_SEED_LANTERNS.forEach((seed, idx) => {
      const createdAt = new Date(now - (idx + 9) * 3600_000 * 4).toISOString();
      insertExtra.run(
        seed.id,
        seed.type,
        seed.mood,
        seed.content,
        seed.nickname,
        seed.stickerId,
        sha256(`seed-extra-secret-${idx}`),
        seed.blessWish,
        seed.blessHug,
        seed.blessNewyear,
        seed.locale,
        createdAt
      );
    });
  }

  async listSkyLanterns(params: {
    limit: number;
    myIds: string[];
    excludeIds?: string[];
    shuffle?: boolean;
  }): Promise<LanternItem[]> {
    const limit = Math.max(1, Math.min(50, params.limit));
    const myItems: LanternItem[] = [];
    const seen = new Set<string>();

    if (params.myIds.length > 0) {
      const cleanIds = params.myIds.slice(0, 20);
      const placeholders = cleanIds.map(() => '?').join(',');
      const mineRows = this.db
        .prepare(
          `SELECT * FROM lanterns WHERE status = 'active' AND id IN (${placeholders}) ORDER BY created_at DESC`
        )
        .all(...cleanIds);
      for (const r of mineRows) {
        const item = { ...rowToLantern(r), isMine: true };
        myItems.push(item);
        seen.add(item.id);
      }
    }

    const remaining = Math.max(0, limit - myItems.length);
    if (remaining === 0) return myItems;

    const result = [...myItems];
    const excludeSet = new Set(params.excludeIds ?? []);

    if (params.shuffle && excludeSet.size > 0) {
      // Prioritize fresh lanterns NOT currently visible on screen first!
      const freshRows = this.db
        .prepare(`SELECT * FROM lanterns WHERE status = 'active' ORDER BY RANDOM()`)
        .all();

      const unseenRows: Record<string, unknown>[] = [];
      const fallbackRows: Record<string, unknown>[] = [];
      for (const r of freshRows) {
        const id = String(r.id);
        if (seen.has(id)) continue;
        if (excludeSet.has(id)) {
          fallbackRows.push(r);
        } else {
          unseenRows.push(r);
        }
      }

      for (const r of [...unseenRows, ...fallbackRows]) {
        const id = String(r.id);
        if (seen.has(id)) continue;
        result.push(rowToLantern(r));
        seen.add(id);
        if (result.length >= limit) break;
      }
      return result;
    }

    const orderClause = params.shuffle
      ? 'ORDER BY RANDOM()'
      : 'ORDER BY created_at DESC';
    const othersRows = this.db
      .prepare(`SELECT * FROM lanterns WHERE status = 'active' ${orderClause} LIMIT ?`)
      .all(remaining + seen.size);

    for (const r of othersRows) {
      const id = String(r.id);
      if (seen.has(id)) continue;
      result.push(rowToLantern(r));
      seen.add(id);
      if (result.length >= limit) break;
    }
    return result;
  }

  async getLanternById(id: string): Promise<LanternItem | null> {
    const row = this.db
      .prepare(`SELECT * FROM lanterns WHERE id = ? AND status = 'active'`)
      .get(id);
    return row ? rowToLantern(row) : null;
  }

  async listLanternsByIds(ids: string[]): Promise<LanternItem[]> {
    if (ids.length === 0) return [];
    const clean = ids.slice(0, 50);
    const placeholders = clean.map(() => '?').join(',');
    const rows = this.db
      .prepare(
        `SELECT * FROM lanterns WHERE status = 'active' AND id IN (${placeholders}) ORDER BY created_at DESC`
      )
      .all(...clean);
    return rows.map((r) => ({ ...rowToLantern(r), isMine: true }));
  }

  async createLantern(input: LanternCreateInput, ipHash: string): Promise<LanternItem> {
    const id = generateId();
    const createdAt = new Date().toISOString();
    const ownerHash = sha256(input.ownerSecret);
    const nickname = input.nickname?.trim() || null;

    this.db
      .prepare(
        `INSERT INTO lanterns (
          id, type, mood, content, nickname, sticker_id, image_url,
          allow_replies, owner_secret_hash, bless_wish_count, bless_hug_count,
          bless_newyear_count, reply_count, status, report_count, locale, ip_hash, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 'active', 0, ?, ?, ?)`
      )
      .run(
        id,
        input.type,
        input.mood,
        input.content.trim(),
        nickname,
        input.stickerId || null,
        input.imageUrl || null,
        input.allowReplies ? 1 : 0,
        ownerHash,
        input.locale,
        ipHash,
        createdAt
      );

    return {
      id,
      type: input.type,
      mood: input.mood,
      content: input.content.trim(),
      nickname,
      stickerId: input.stickerId || null,
      imageUrl: input.imageUrl || null,
      allowReplies: input.allowReplies,
      blessWishCount: 0,
      blessHugCount: 0,
      blessNewyearCount: 0,
      replyCount: 0,
      status: 'active',
      reportCount: 0,
      locale: input.locale,
      createdAt,
      isMine: true,
    };
  }

  async deleteLanternByOwner(
    id: string,
    ownerSecret: string
  ): Promise<{ deleted: boolean; imageUrl?: string | null }> {
    const row = this.db
      .prepare(`SELECT owner_secret_hash, image_url FROM lanterns WHERE id = ? AND status != 'deleted_by_owner'`)
      .get(id);
    if (!row) return { deleted: false };

    const expectedHash = String(row.owner_secret_hash);
    if (sha256(ownerSecret) !== expectedHash) {
      return { deleted: false };
    }

    this.db
      .prepare(`UPDATE lanterns SET status = 'deleted_by_owner' WHERE id = ?`)
      .run(id);
    return {
      deleted: true,
      imageUrl: row.image_url ? String(row.image_url) : null,
    };
  }

  async listReplies(lanternId: string): Promise<ReplyItem[]> {
    const rows = this.db
      .prepare(
        `SELECT * FROM replies WHERE lantern_id = ? AND status = 'active' ORDER BY created_at ASC`
      )
      .all(lanternId);
    return rows.map(rowToReply);
  }

  async createReply(
    lanternId: string,
    input: { content: string; nickname?: string },
    ipHash: string
  ): Promise<{ reply?: ReplyItem; error?: 'not_found' | 'replies_disabled' }> {
    const lantern = this.db
      .prepare(`SELECT id, allow_replies FROM lanterns WHERE id = ? AND status = 'active'`)
      .get(lanternId);
    if (!lantern) return { error: 'not_found' };
    if (!lantern.allow_replies) return { error: 'replies_disabled' };

    const id = generateId();
    const createdAt = new Date().toISOString();
    const nickname = input.nickname?.trim() || null;

    this.db
      .prepare(
        `INSERT INTO replies (id, lantern_id, content, nickname, status, report_count, ip_hash, created_at)
         VALUES (?, ?, ?, ?, 'active', 0, ?, ?)`
      )
      .run(id, lanternId, input.content.trim(), nickname, ipHash, createdAt);

    this.db
      .prepare(`UPDATE lanterns SET reply_count = reply_count + 1 WHERE id = ?`)
      .run(lanternId);

    return {
      reply: {
        id,
        lanternId,
        content: input.content.trim(),
        nickname,
        status: 'active',
        reportCount: 0,
        createdAt,
      },
    };
  }

  async addBlessing(
    lanternId: string,
    blessing: BlessingType
  ): Promise<LanternItem | null> {
    const col =
      blessing === 'wish'
        ? 'bless_wish_count'
        : blessing === 'hug'
        ? 'bless_hug_count'
        : 'bless_newyear_count';

    const res = this.db
      .prepare(`UPDATE lanterns SET ${col} = ${col} + 1 WHERE id = ? AND status = 'active'`)
      .run(lanternId);
    if (res.changes === 0) return null;
    return this.getLanternById(lanternId);
  }

  async submitReport(params: {
    targetType: 'lantern' | 'reply';
    targetId: string;
    reason: ReportReason;
    reporterHash: string;
  }): Promise<{ accepted: boolean; hiddenTriggered: boolean; reportCount: number }> {
    const table = params.targetType === 'lantern' ? 'lanterns' : 'replies';
    const existingTarget = this.db
      .prepare(`SELECT id, report_count, status FROM ${table} WHERE id = ?`)
      .get(params.targetId);
    if (!existingTarget) {
      return { accepted: false, hiddenTriggered: false, reportCount: 0 };
    }

    try {
      this.db
        .prepare(
          `INSERT INTO reports (id, target_type, target_id, reason, reporter_hash, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(
          generateId(),
          params.targetType,
          params.targetId,
          params.reason,
          params.reporterHash,
          new Date().toISOString()
        );
    } catch {
      // Already reported by this reporterHash (UNIQUE constraint)
      return {
        accepted: false,
        hiddenTriggered: false,
        reportCount: Number(existingTarget.report_count ?? 0),
      };
    }

    const nextCount = Number(existingTarget.report_count ?? 0) + 1;
    const shouldHide =
      nextCount >= AUTO_HIDE_REPORT_THRESHOLD && existingTarget.status === 'active';

    if (shouldHide) {
      this.db
        .prepare(
          `UPDATE ${table} SET report_count = ?, status = 'hidden_by_report' WHERE id = ?`
        )
        .run(nextCount, params.targetId);
    } else {
      this.db
        .prepare(`UPDATE ${table} SET report_count = ? WHERE id = ?`)
        .run(nextCount, params.targetId);
    }

    return { accepted: true, hiddenTriggered: shouldHide, reportCount: nextCount };
  }

  async isIpBanned(ipHash: string): Promise<boolean> {
    const row = this.db
      .prepare(`SELECT ip_hash FROM banned_ips WHERE ip_hash = ?`)
      .get(ipHash);
    return Boolean(row);
  }

  async adminListLanterns(
    filter: 'all' | 'reported' | 'images'
  ): Promise<AdminLanternItem[]> {
    let where = '';
    if (filter === 'reported') {
      where = `WHERE report_count > 0 OR status = 'hidden_by_report'`;
    } else if (filter === 'images') {
      where = `WHERE image_url IS NOT NULL`;
    }
    const rows = this.db
      .prepare(`SELECT * FROM lanterns ${where} ORDER BY created_at DESC LIMIT 120`)
      .all();
    return rows.map((r) => ({
      ...rowToLantern(r),
      ipHash: String(r.ip_hash),
    }));
  }

  async adminListReplies(filter: 'all' | 'reported'): Promise<AdminReplyItem[]> {
    const where =
      filter === 'reported'
        ? `WHERE r.report_count > 0 OR r.status = 'hidden_by_report'`
        : '';
    const rows = this.db
      .prepare(
        `SELECT r.*, l.content AS lantern_preview
         FROM replies r
         LEFT JOIN lanterns l ON l.id = r.lantern_id
         ${where}
         ORDER BY r.created_at DESC LIMIT 120`
      )
      .all();
    return rows.map((r) => ({
      ...rowToReply(r),
      ipHash: String(r.ip_hash),
      lanternPreview: r.lantern_preview ? String(r.lantern_preview).slice(0, 40) : undefined,
    }));
  }

  async adminUpdateLanternStatus(
    id: string,
    status: LanternStatus
  ): Promise<{ updated: boolean; imageUrl?: string | null }> {
    const row = this.db
      .prepare(`SELECT image_url FROM lanterns WHERE id = ?`)
      .get(id);
    if (!row) return { updated: false };

    if (status === 'active') {
      this.db
        .prepare(`UPDATE lanterns SET status = ?, report_count = 0 WHERE id = ?`)
        .run(status, id);
    } else {
      this.db
        .prepare(`UPDATE lanterns SET status = ? WHERE id = ?`)
        .run(status, id);
    }

    return {
      updated: true,
      imageUrl: row.image_url ? String(row.image_url) : null,
    };
  }

  async adminUpdateReplyStatus(id: string, status: ReplyStatus): Promise<boolean> {
    const res =
      status === 'active'
        ? this.db
            .prepare(`UPDATE replies SET status = ?, report_count = 0 WHERE id = ?`)
            .run(status, id)
        : this.db.prepare(`UPDATE replies SET status = ? WHERE id = ?`).run(status, id);
    return res.changes > 0;
  }

  async adminBanIp(ipHash: string, reason = 'admin'): Promise<void> {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO banned_ips (ip_hash, reason, created_at) VALUES (?, ?, ?)`
      )
      .run(ipHash, reason, new Date().toISOString());
  }
}
