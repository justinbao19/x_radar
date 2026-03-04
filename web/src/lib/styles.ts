import { Tweet } from './types';

export const groupLabels: Record<string, string> = {
  pain: '痛点',
  reach: '传播',
  kol: 'KOL',
  sentiment: '舆情',
  insight: '洞察',
};

export function getGroupLabel(tweet: Tweet): string {
  return tweet.originalGroup === 'kol' ? 'KOL' : groupLabels[tweet.group] || tweet.group;
}

export function getGroupColor(tweet: Tweet): string {
  if (tweet.group === 'pain') return 'bg-rose-50 text-rose-700 border border-rose-200/50';
  if (tweet.originalGroup === 'kol') return 'bg-purple-50 text-purple-700 border border-purple-200/50';
  if (tweet.group === 'sentiment') return 'bg-orange-50 text-orange-700 border border-orange-200/50';
  if (tweet.group === 'insight') return 'bg-cyan-50 text-cyan-700 border border-cyan-200/50';
  return 'bg-sky-50 text-sky-700 border border-sky-200/50';
}

export function getSentimentStyle(sentimentLabel?: string) {
  switch (sentimentLabel) {
    case 'negative':
      return { label: '需关注', color: 'bg-red-100 text-red-700 border border-red-300', icon: '⚠️' };
    case 'positive':
      return { label: '积极', color: 'bg-green-50 text-green-700 border border-green-200', icon: '✓' };
    case 'neutral':
      return { label: '中性', color: 'bg-stone-100 text-stone-600 border border-stone-200', icon: '○' };
    default:
      return null;
  }
}

export function getInsightStyle(insightType?: string) {
  switch (insightType) {
    case 'feature_request':
      return { label: '功能需求', color: 'bg-amber-50 text-amber-700 border border-amber-200' };
    case 'competitor_praise':
      return { label: '竞品好评', color: 'bg-indigo-50 text-indigo-700 border border-indigo-200' };
    case 'ai_demand':
      return { label: 'AI需求', color: 'bg-cyan-50 text-cyan-700 border border-cyan-200' };
    default:
      return null;
  }
}

export const languageMap: Record<string, { flag: string; label: string }> = {
  en: { flag: '🇺🇸', label: '英语' },
  ja: { flag: '🇯🇵', label: '日语' },
  zh: { flag: '🇨🇳', label: '中文' },
  ko: { flag: '🇰🇷', label: '韩语' },
  fr: { flag: '🇫🇷', label: '法语' },
  de: { flag: '🇩🇪', label: '德语' },
  es: { flag: '🇪🇸', label: '西班牙语' },
  pt: { flag: '🇵🇹', label: '葡萄牙语' },
  ru: { flag: '🇷🇺', label: '俄语' },
  other: { flag: '🌐', label: '其他' },
};

export function getScoreStyle(score: number): { bg: string; text: string; label: string } {
  if (score >= 500) {
    return {
      bg: 'bg-gradient-to-br from-amber-50 via-orange-50 to-purple-50 border-amber-300/60',
      text: 'bg-gradient-to-r from-amber-600 via-orange-500 to-purple-600 bg-clip-text text-transparent',
      label: '传奇',
    };
  } else if (score >= 200) {
    return {
      bg: 'bg-gradient-to-br from-orange-50 to-amber-50 border-orange-200/60',
      text: 'bg-gradient-to-r from-orange-500 to-amber-500 bg-clip-text text-transparent',
      label: '优秀',
    };
  } else if (score >= 100) {
    return {
      bg: 'bg-gradient-to-br from-sky-50 to-blue-50 border-sky-200/60',
      text: 'bg-gradient-to-r from-sky-500 to-blue-500 bg-clip-text text-transparent',
      label: '良好',
    };
  } else if (score >= 50) {
    return {
      bg: 'bg-stone-50 border-stone-200/60',
      text: 'text-stone-600',
      label: '普通',
    };
  } else {
    return {
      bg: 'bg-stone-50 border-stone-100',
      text: 'text-stone-400',
      label: '一般',
    };
  }
}
