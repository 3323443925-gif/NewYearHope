import { describe, expect, it } from 'vitest';
import { SqliteLanternRepository } from '@/server/db/sqliteRepo';

describe('SqliteLanternRepository end-to-end rules', () => {
  it('supports create, prioritized myIds lookup, owner retract, reply toggle, and 3-report auto-hide', async () => {
    const repo = new SqliteLanternRepository(':memory:', false);

    // 1. Create lantern with replies enabled
    const created = await repo.createLantern(
      {
        type: 'wish',
        mood: 'hopeful',
        content: '愿新年星光常伴。',
        nickname: '小雪',
        stickerId: 'north-star',
        imageUrl: null,
        allowReplies: true,
        locale: 'zh',
        ownerSecret: 'secret-token-for-device-A-123456',
      },
      'ip-hash-1'
    );
    expect(created.id).toBeTruthy();

    // 2. Reply & blessing work
    const replyRes = await repo.createReply(
      created.id,
      { content: '祝你新年快乐！', nickname: '旅人' },
      'ip-hash-2'
    );
    expect(replyRes.reply?.content).toBe('祝你新年快乐！');

    const blessed = await repo.addBlessing(created.id, 'hug');
    expect(blessed?.blessHugCount).toBe(1);
    expect(blessed?.replyCount).toBe(1);

    // 3. Create lantern with replies DISABLED
    const quiet = await repo.createLantern(
      {
        type: 'unspoken',
        mood: 'lonely',
        content: '只想安静放飞一句话。',
        allowReplies: false,
        locale: 'zh',
        ownerSecret: 'secret-token-for-device-B-654321',
      },
      'ip-hash-3'
    );
    const blockedReply = await repo.createReply(
      quiet.id,
      { content: '试图评论' },
      'ip-hash-4'
    );
    expect(blockedReply.error).toBe('replies_disabled');

    // 4. Wrong owner secret cannot retract; correct secret retracts
    const wrongDelete = await repo.deleteLanternByOwner(created.id, 'wrong-secret-000000000');
    expect(wrongDelete.deleted).toBe(false);

    const rightDelete = await repo.deleteLanternByOwner(
      created.id,
      'secret-token-for-device-A-123456'
    );
    expect(rightDelete.deleted).toBe(true);
    expect(await repo.getLanternById(created.id)).toBeNull();

    // 5. Three distinct reports auto-hide a lantern, duplicate reporter ignored
    const r1 = await repo.submitReport({
      targetType: 'lantern',
      targetId: quiet.id,
      reason: 'spam',
      reporterHash: 'rep-1',
    });
    expect(r1.accepted).toBe(true);
    expect(r1.hiddenTriggered).toBe(false);

    const dup = await repo.submitReport({
      targetType: 'lantern',
      targetId: quiet.id,
      reason: 'spam',
      reporterHash: 'rep-1',
    });
    expect(dup.accepted).toBe(false);

    await repo.submitReport({
      targetType: 'lantern',
      targetId: quiet.id,
      reason: 'spam',
      reporterHash: 'rep-2',
    });
    const r3 = await repo.submitReport({
      targetType: 'lantern',
      targetId: quiet.id,
      reason: 'spam',
      reporterHash: 'rep-3',
    });
    expect(r3.hiddenTriggered).toBe(true);
    expect(await repo.getLanternById(quiet.id)).toBeNull();

    // Admin can restore it back to active
    await repo.adminUpdateLanternStatus(quiet.id, 'active');
    const restored = await repo.getLanternById(quiet.id);
    expect(restored?.status).toBe('active');
    expect(restored?.reportCount).toBe(0);

    // 6. Refresh Sky shuffle prioritizes unseen lanterns via excludeIds
    const extra = await repo.createLantern(
      {
        type: 'greeting',
        mood: 'grateful',
        content: '愿新的一批夜空也同样温柔。',
        allowReplies: true,
        locale: 'zh',
        ownerSecret: 'secret-token-for-device-C-777777',
      },
      'ip-hash-5'
    );
    const refreshed = await repo.listSkyLanterns({
      limit: 1,
      myIds: [],
      excludeIds: [quiet.id],
      shuffle: true,
    });
    expect(refreshed[0]?.id).toBe(extra.id);
  });
});
