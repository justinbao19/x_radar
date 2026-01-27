// ============ Tweet Types ============

export interface ReplyOption {
  comment: string;
  zh_explain: string;
  angle: 'witty' | 'practical' | 'subtle_product';
  charCount: number;
  risk: 'low' | 'medium' | 'high';
  recommended: boolean;
}

export interface TweetComments {
  language: string;
  generatedAt: string;
  tweetTranslationZh?: string;
  productRelevance?: 'high' | 'medium' | 'low';
  options: ReplyOption[];
}

export interface Tweet {
  rank: number;
  group: 'pain' | 'reach';
  originalGroup: 'pain' | 'reach' | 'kol';
  sourceQuery: string;
  url: string;
  author: string;
  datetime: string;
  text: string;
  likes: number;
  retweets: number;
  replies: number;
  viralityScore: number;
  filoFitScore: number;
  textBonus: number;
  finalScore: number;
  detectedLanguage: string;
  lowSignalWarning?: string;
  aiPicked?: boolean;
  comments: TweetComments | null;
  commentError: string | null;
  commentSkipped: boolean;
  skipReason?: string;
  skipReasonZh?: string;
}

// ============ Data File Types ============

export interface SelectionStats {
  totalCandidates: number;
  uniqueAfterDedup: number;
  painSelected: number;
  reachSelected: number;
  backfilled: number;
  aiPicked?: number;
  qualified?: number;
}

export interface CommentGenerationStats {
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
  skipReasons: Record<string, number>;
  byLanguage: Record<string, number>;
}

export interface RadarData {
  runAt: string;
  runDate?: string;
  selectionStats: SelectionStats;
  quota: {
    pain: number;
    reach: number;
    total: number;
  };
  top: Tweet[];
  commentGenerationStats: CommentGenerationStats;
}

// ============ Manifest Types ============

export interface DataFileInfo {
  filename: string;
  timestamp: string;
  date: string;
  tweetCount: number;
  succeeded: number;
}

export interface Manifest {
  lastUpdated: string;
  files: DataFileInfo[];
  authStatus?: {
    valid: boolean;
    lastCheck: string;
    reason?: string;
  };
}

// ============ UI Types ============

export type ViewMode = 'card' | 'list' | 'timeline';

export type CategoryFilter = 'all' | 'pain' | 'reach' | 'kol';

export interface DateRange {
  start: Date;
  end: Date;
}

export interface FilterState {
  dateRange: DateRange;
  categories: CategoryFilter[];
  viewMode: ViewMode;
  showAiPickedOnly: boolean;
}
