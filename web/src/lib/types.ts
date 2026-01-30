// ============ Top-Level Radar Category ============

export type RadarCategory = 'pain_radar' | 'filo_sentiment' | 'user_insight';

// ============ Sentiment & Insight Types ============

export type SentimentLabel = 'positive' | 'negative' | 'neutral';

export type InsightType = 'feature_request' | 'competitor_praise' | 'ai_demand' | 'general';

// ============ Tweet Types ============

export interface ReplyOption {
  comment: string;
  comment_zh?: string;
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
  group: 'pain' | 'reach' | 'sentiment' | 'insight';
  originalGroup: 'pain' | 'reach' | 'kol' | 'sentiment' | 'insight';
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
  painEmotionBonus?: number;     // NEW: bonus for pain/frustration words
  requestSignalBonus?: number;   // NEW: bonus for feature request signals
  finalScore: number;
  detectedLanguage: string;
  lowSignalWarning?: string;
  aiPicked?: boolean;
  painEmotionWords?: string[];   // NEW: detected pain emotion words
  requestPatterns?: string[];    // NEW: matched request patterns
  comments: TweetComments | null;
  commentError: string | null;
  commentSkipped: boolean;
  skipReason?: string;
  skipReasonZh?: string;
  fetchedAt?: string;  // 推文被抓取的时间（来自 RadarData.runAt）
  // Sentiment group fields
  sentimentLabel?: SentimentLabel;
  // Insight group fields
  insightType?: InsightType;
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
  byGroup?: {
    pain: number;
    reach: number;
    kol: number;
    sentiment: number;
    insight: number;
  };
  bySentiment?: {
    positive: number;
    negative: number;
    neutral: number;
  };
  byInsightType?: {
    feature_request: number;
    competitor_praise: number;
    ai_demand: number;
  };
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

// Pain Radar filters
export type PainRadarFilter = 'all' | 'pain' | 'reach' | 'kol' | 'new';

// Sentiment filters (Filo舆情)
export type SentimentFilter = 'all' | 'new' | 'positive' | 'negative' | 'neutral';

// Insight filters (用户洞察)
export type InsightFilter = 'all' | 'new' | 'feature_request' | 'competitor_praise' | 'ai_demand';

// Union type for all category filters
export type CategoryFilter = PainRadarFilter | SentimentFilter | InsightFilter;

export type SortOption = 'score' | 'date' | 'engagement';

export type LanguageFilter = 'all' | string;

export interface DateRange {
  start: Date;
  end: Date;
}

// 基于爬取次数的时间筛选
export type RunCountPreset = 'today' | '3days' | '7days';

// 每天爬取次数（用于计算文件数量）
export const RUNS_PER_DAY = 4;

export interface FilterState {
  dateRange: DateRange;
  categories: CategoryFilter[];
  viewMode: ViewMode;
  showAiPickedOnly: boolean;
}
