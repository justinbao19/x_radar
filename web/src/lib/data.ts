import { RadarData, Tweet, Manifest, DataFileInfo, DateRange } from './types';

// ============ Constants ============

const DATA_PATH = '/data';

// ============ Data Loading ============

/**
 * Load the manifest file
 */
export async function loadManifest(): Promise<Manifest | null> {
  try {
    const res = await fetch(`${DATA_PATH}/manifest.json`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Load a single data file
 */
export async function loadDataFile(filename: string): Promise<RadarData | null> {
  try {
    const res = await fetch(`${DATA_PATH}/${filename}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Load all data files within a date range
 */
export async function loadDataByDateRange(
  manifest: Manifest,
  dateRange: DateRange
): Promise<RadarData[]> {
  const startDate = new Date(dateRange.start);
  startDate.setHours(0, 0, 0, 0);
  
  const endDate = new Date(dateRange.end);
  endDate.setHours(23, 59, 59, 999);

  const filesToLoad = manifest.files.filter(file => {
    const fileDate = new Date(file.timestamp);
    return fileDate >= startDate && fileDate <= endDate;
  });

  const results = await Promise.all(
    filesToLoad.map(file => loadDataFile(file.filename))
  );

  return results.filter((data): data is RadarData => data !== null);
}

// ============ Data Processing ============

/**
 * Merge multiple RadarData objects, deduplicating tweets by URL
 */
export function mergeRadarData(dataList: RadarData[]): Tweet[] {
  const tweetMap = new Map<string, Tweet>();
  
  for (const data of dataList) {
    for (const tweet of data.top) {
      const existing = tweetMap.get(tweet.url);
      // Keep the newer version or the one with comments
      if (!existing || 
          (tweet.comments && !existing.comments) ||
          new Date(tweet.datetime) > new Date(existing.datetime)) {
        tweetMap.set(tweet.url, {
          ...tweet,
          // Add runAt for timeline view
          datetime: tweet.datetime || data.runAt
        });
      }
    }
  }

  return Array.from(tweetMap.values());
}

/**
 * Sort tweets by various criteria
 */
export function sortTweets(
  tweets: Tweet[], 
  sortBy: 'score' | 'date' | 'engagement' = 'score'
): Tweet[] {
  return [...tweets].sort((a, b) => {
    switch (sortBy) {
      case 'date':
        return new Date(b.datetime).getTime() - new Date(a.datetime).getTime();
      case 'engagement':
        return (b.likes + b.retweets + b.replies) - (a.likes + a.retweets + a.replies);
      case 'score':
      default:
        return b.finalScore - a.finalScore;
    }
  });
}

/**
 * Filter tweets by category
 */
export function filterByCategory(
  tweets: Tweet[],
  categories: ('all' | 'pain' | 'reach' | 'kol')[]
): Tweet[] {
  if (categories.includes('all')) return tweets;
  
  return tweets.filter(tweet => {
    if (categories.includes('kol') && tweet.originalGroup === 'kol') return true;
    if (categories.includes('pain') && tweet.group === 'pain') return true;
    if (categories.includes('reach') && tweet.group === 'reach') return true;
    return false;
  });
}

/**
 * Filter to show only AI-picked tweets
 */
export function filterAiPicked(tweets: Tweet[]): Tweet[] {
  return tweets.filter(tweet => tweet.aiPicked !== false);
}

// ============ Statistics ============

export interface TweetStats {
  total: number;
  byCategory: {
    pain: number;
    reach: number;
    kol: number;
  };
  byLanguage: Record<string, number>;
  withComments: number;
  skipped: number;
  aiPicked: number;
}

export function calculateStats(tweets: Tweet[]): TweetStats {
  const stats: TweetStats = {
    total: tweets.length,
    byCategory: { pain: 0, reach: 0, kol: 0 },
    byLanguage: {},
    withComments: 0,
    skipped: 0,
    aiPicked: 0
  };

  for (const tweet of tweets) {
    // Category
    if (tweet.originalGroup === 'kol') {
      stats.byCategory.kol++;
    } else if (tweet.group === 'pain') {
      stats.byCategory.pain++;
    } else {
      stats.byCategory.reach++;
    }

    // Language
    const lang = tweet.detectedLanguage || 'unknown';
    stats.byLanguage[lang] = (stats.byLanguage[lang] || 0) + 1;

    // Comments
    if (tweet.comments) {
      stats.withComments++;
    }
    if (tweet.commentSkipped) {
      stats.skipped++;
    }

    // AI Picked
    if (tweet.aiPicked !== false) {
      stats.aiPicked++;
    }
  }

  return stats;
}

// ============ Date Helpers ============

export function getDateRangePreset(preset: 'today' | 'yesterday' | '3days' | '7days'): DateRange {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  switch (preset) {
    case 'yesterday':
      start.setDate(start.getDate() - 1);
      end.setDate(end.getDate() - 1);
      break;
    case '3days':
      start.setDate(start.getDate() - 2);
      break;
    case '7days':
      start.setDate(start.getDate() - 6);
      break;
  }

  return { start, end };
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function formatNumber(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

// ============ Unique Dates from Manifest ============

export function getUniqueDates(manifest: Manifest): string[] {
  const dates = new Set<string>();
  for (const file of manifest.files) {
    dates.add(file.date);
  }
  return Array.from(dates).sort().reverse();
}

export function getFilesByDate(manifest: Manifest, date: string): DataFileInfo[] {
  return manifest.files.filter(f => f.date === date);
}
