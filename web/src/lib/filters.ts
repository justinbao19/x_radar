import { Tweet } from './types';

// ============ Blocked Authors ============

const BLOCKED_AUTHORS = new Set([
  'gaborcselle', 'gaborcselle_', 'gaborcselle__',
  'gaborcselle___', 'grok',
]);

// ============ Allowed Languages ============

const ALLOWED_LANGUAGES = new Set(['en', 'zh', 'ja', 'zh-cn', 'zh-tw']);

// ============ Content Filters ============

const POLITICAL_PATTERNS = [
  /\b(trump|biden|election|congress|senate|democrat|republican|maga)\b/i,
  /\b(政治|选举|国会|民主党|共和党)\b/,
];

const PROMO_PATTERNS = [
  /\b(giveaway|airdrop|whitelist|presale|ico|token sale)\b/i,
  /\b(limited offer|act now|don't miss|exclusive deal)\b/i,
  /\b(撸毛|空投|白名单|预售)\b/,
];

const SPAM_PATTERNS = [
  /(.)\1{5,}/,
  /\b(follow me|follow back|f4f|l4l)\b/i,
  /https?:\/\/\S+\s*$/,
];

// ============ Quality Thresholds ============

const MAX_TWEET_AGE_HOURS = 72;
const MIN_QUALITY_SCORE = 200;

// ============ Filter Functions ============

function isBlockedAuthor(author: string): boolean {
  return BLOCKED_AUTHORS.has(author.replace('@', '').toLowerCase());
}

function isAllowedLanguage(lang: string | undefined): boolean {
  if (!lang) return true;
  return ALLOWED_LANGUAGES.has(lang.toLowerCase());
}

function containsPoliticalContent(text: string): boolean {
  return POLITICAL_PATTERNS.some(p => p.test(text));
}

function isPromotionalContent(text: string): boolean {
  return PROMO_PATTERNS.some(p => p.test(text));
}

function isSpamContent(text: string): boolean {
  return SPAM_PATTERNS.some(p => p.test(text));
}

function isTooOld(datetime: string | undefined): boolean {
  if (!datetime) return false;
  const ageMs = Date.now() - new Date(datetime).getTime();
  return ageMs > MAX_TWEET_AGE_HOURS * 60 * 60 * 1000;
}

function hasEngagement(tweet: Tweet): boolean {
  return (tweet.likes || 0) + (tweet.retweets || 0) + (tweet.replies || 0) > 0;
}

// ============ Main Filter Pipeline ============

export interface FilterResult {
  passed: Tweet[];
  stats: {
    total: number;
    blocked_author: number;
    bad_language: number;
    too_old: number;
    political: number;
    promotional: number;
    spam: number;
    low_quality: number;
    passed: number;
  };
}

export function filterTweets(tweets: Tweet[]): FilterResult {
  const stats = {
    total: tweets.length,
    blocked_author: 0,
    bad_language: 0,
    too_old: 0,
    political: 0,
    promotional: 0,
    spam: 0,
    low_quality: 0,
    passed: 0,
  };

  const passed = tweets.filter(tweet => {
    if (isBlockedAuthor(tweet.author)) {
      stats.blocked_author++;
      return false;
    }

    if (!isAllowedLanguage(tweet.detectedLanguage)) {
      stats.bad_language++;
      return false;
    }

    if (isTooOld(tweet.datetime)) {
      stats.too_old++;
      return false;
    }

    if (containsPoliticalContent(tweet.text)) {
      stats.political++;
      return false;
    }

    if (isPromotionalContent(tweet.text)) {
      stats.promotional++;
      return false;
    }

    if (isSpamContent(tweet.text)) {
      stats.spam++;
      return false;
    }

    if (tweet.finalScore < MIN_QUALITY_SCORE && !tweet.aiPicked && !hasEngagement(tweet)) {
      stats.low_quality++;
      return false;
    }

    return true;
  });

  stats.passed = passed.length;
  return { passed, stats };
}

// ============ Sorting ============

export function sortForSwipe(tweets: Tweet[]): Tweet[] {
  return [...tweets].sort((a, b) => {
    const groupPriority: Record<string, number> = {
      sentiment: 0,
      pain: 1,
      insight: 2,
      reach: 3,
    };
    const aPriority = groupPriority[a.group] ?? 4;
    const bPriority = groupPriority[b.group] ?? 4;
    if (aPriority !== bPriority) return aPriority - bPriority;

    const aAi = a.aiPicked ? 1 : 0;
    const bAi = b.aiPicked ? 1 : 0;
    if (aAi !== bAi) return bAi - aAi;

    return b.finalScore - a.finalScore;
  });
}
