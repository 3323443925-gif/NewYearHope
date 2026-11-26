import type {
  AdminLanternItem,
  AdminReplyItem,
  BlessingType,
  LanternCreateInput,
  LanternItem,
  LanternStatus,
  ReplyItem,
  ReplyStatus,
  ReportReason,
} from '@/types/lantern';

export interface LanternRepository {
  listSkyLanterns(params: {
    limit: number;
    myIds: string[];
    excludeIds?: string[];
    shuffle?: boolean;
  }): Promise<LanternItem[]>;

  getLanternById(id: string): Promise<LanternItem | null>;

  listLanternsByIds(ids: string[]): Promise<LanternItem[]>;

  createLantern(input: LanternCreateInput, ipHash: string): Promise<LanternItem>;

  deleteLanternByOwner(
    id: string,
    ownerSecret: string
  ): Promise<{ deleted: boolean; imageUrl?: string | null }>;

  listReplies(lanternId: string): Promise<ReplyItem[]>;

  createReply(
    lanternId: string,
    input: { content: string; nickname?: string },
    ipHash: string
  ): Promise<{ reply?: ReplyItem; error?: 'not_found' | 'replies_disabled' }>;

  addBlessing(
    lanternId: string,
    blessing: BlessingType
  ): Promise<LanternItem | null>;

  submitReport(params: {
    targetType: 'lantern' | 'reply';
    targetId: string;
    reason: ReportReason;
    reporterHash: string;
  }): Promise<{ accepted: boolean; hiddenTriggered: boolean; reportCount: number }>;

  isIpBanned(ipHash: string): Promise<boolean>;

  // Admin operations
  adminListLanterns(filter: 'all' | 'reported' | 'images'): Promise<AdminLanternItem[]>;
  adminListReplies(filter: 'all' | 'reported'): Promise<AdminReplyItem[]>;
  adminUpdateLanternStatus(
    id: string,
    status: LanternStatus
  ): Promise<{ updated: boolean; imageUrl?: string | null }>;
  adminUpdateReplyStatus(id: string, status: ReplyStatus): Promise<boolean>;
  adminBanIp(ipHash: string, reason?: string): Promise<void>;
}
