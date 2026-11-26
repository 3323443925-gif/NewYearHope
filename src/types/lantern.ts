export type Locale = 'zh' | 'en';

export type LanternType = 'wish' | 'unspoken' | 'greeting';

export type MoodKey =
  | 'hopeful'
  | 'missing'
  | 'relieved'
  | 'lonely'
  | 'grateful'
  | 'encouraging';

export type BlessingType = 'wish' | 'hug' | 'newyear';

export type LanternStatus =
  | 'active'
  | 'hidden_by_report'
  | 'deleted_by_owner'
  | 'deleted_by_admin';

export type ReplyStatus = 'active' | 'hidden_by_report' | 'deleted_by_admin';

export type ReportReason = 'spam' | 'unkind' | 'inappropriate_image' | 'other';

export type FestivalStage =
  | 'early_dec'
  | 'christmas_week'
  | 'countdown'
  | 'new_year_finale'
  | 'eternal_isle';

export interface LanternItem {
  id: string;
  type: LanternType;
  mood: MoodKey;
  content: string;
  nickname: string | null;
  stickerId: string | null;
  imageUrl: string | null;
  allowReplies: boolean;
  blessWishCount: number;
  blessHugCount: number;
  blessNewyearCount: number;
  replyCount: number;
  status: LanternStatus;
  reportCount: number;
  locale: Locale;
  createdAt: string;
  isMine?: boolean;
}

export interface ReplyItem {
  id: string;
  lanternId: string;
  content: string;
  nickname: string | null;
  status: ReplyStatus;
  reportCount: number;
  createdAt: string;
}

export interface AdminLanternItem extends LanternItem {
  ipHash: string;
}

export interface AdminReplyItem extends ReplyItem {
  ipHash: string;
  lanternPreview?: string;
}

export interface ModerationResult {
  allowed: boolean;
  reason?: 'profanity' | 'spam' | 'inappropriate_image';
  crisisSupport?: boolean;
}

export interface LanternCreateInput {
  type: LanternType;
  mood: MoodKey;
  content: string;
  nickname?: string;
  stickerId?: string | null;
  imageUrl?: string | null;
  allowReplies: boolean;
  locale: Locale;
  ownerSecret: string;
}

export interface ReplyCreateInput {
  content: string;
  nickname?: string;
}
