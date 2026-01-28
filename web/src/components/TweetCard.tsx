'use client';

import { useState, useEffect } from 'react';
import { Tweet, ReplyOption } from '@/lib/types';
import { formatNumber, formatDateTime, formatRelativeTime } from '@/lib/data';

interface TweetCardProps {
  tweet: Tweet;
  index: number;
  showComments?: boolean;
  collapsible?: boolean;
  isNew?: boolean;
}

function ReplyOptionCard({ 
  option, 
  isRecommended,
  onCopy 
}: { 
  option: ReplyOption; 
  isRecommended: boolean;
  onCopy: (text: string) => void;
}) {
  const riskColors = {
    low: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    medium: 'bg-amber-50 text-amber-700 border border-amber-200',
    high: 'bg-red-50 text-red-700 border border-red-200'
  };

  const riskLabels = {
    low: '低风险',
    medium: '中风险',
    high: '高风险'
  };

  const [showExplain, setShowExplain] = useState(false);

  return (
    <div className={`p-4 rounded-xl border transition-all ${
      isRecommended 
        ? 'border-amber-300 bg-gradient-to-br from-amber-50/80 to-orange-50/50 shadow-sm' 
        : 'border-stone-200 bg-white hover:border-stone-300'
    }`}>
      {isRecommended && (
        <div className="flex items-center gap-1.5 text-amber-600 text-xs font-semibold mb-2">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L9.19 8.63L2 9.24L7.46 13.97L5.82 21L12 17.27L18.18 21L16.54 13.97L22 9.24L14.81 8.63L12 2Z"/>
          </svg>
          AI 推荐
        </div>
      )}
      
      <p className="text-stone-700 text-sm leading-relaxed mb-2 pr-16">
        {option.comment}
      </p>
      
      {/* Comment Translation */}
      {option.comment_zh && (
        <p className="text-stone-500 text-xs leading-relaxed mb-3 pr-16 pl-3 border-l-2 border-amber-300 bg-amber-50/30 py-1 rounded-r">
          {option.comment_zh}
        </p>
      )}
      
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xs text-stone-400">{option.charCount} 字符</span>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${riskColors[option.risk]}`}>
            {riskLabels[option.risk]}
          </span>
        </div>
        
        <button
          onClick={() => onCopy(option.comment)}
          className="text-xs font-medium text-stone-500 hover:text-amber-700 flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-amber-50 border border-transparent hover:border-amber-200 transition-all"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          复制
        </button>
      </div>

      {option.zh_explain && (
        <div className="mt-3 pt-3 border-t border-stone-100">
          <button
            onClick={() => setShowExplain(!showExplain)}
            className="text-xs text-stone-400 hover:text-stone-600 flex items-center gap-1.5 transition-colors"
          >
            <svg 
              className={`w-3 h-3 transition-transform duration-200 ${showExplain ? 'rotate-90' : ''}`} 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            策略解释
          </button>
          {showExplain && (
            <p className="mt-2 text-xs text-stone-500 leading-relaxed pl-4 border-l-2 border-stone-200 animate-fade-in">
              {option.zh_explain}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// 根据分数返回对应的样式类
function getScoreStyle(score: number): { bg: string; text: string; label: string } {
  if (score >= 500) {
    // 传奇级 - 紫金渐变
    return {
      bg: 'bg-gradient-to-br from-amber-50 via-orange-50 to-purple-50 border-amber-300/60',
      text: 'bg-gradient-to-r from-amber-600 via-orange-500 to-purple-600 bg-clip-text text-transparent',
      label: '传奇'
    };
  } else if (score >= 200) {
    // 优秀 - 橙色渐变
    return {
      bg: 'bg-gradient-to-br from-orange-50 to-amber-50 border-orange-200/60',
      text: 'bg-gradient-to-r from-orange-500 to-amber-500 bg-clip-text text-transparent',
      label: '优秀'
    };
  } else if (score >= 100) {
    // 良好 - 蓝色渐变
    return {
      bg: 'bg-gradient-to-br from-sky-50 to-blue-50 border-sky-200/60',
      text: 'bg-gradient-to-r from-sky-500 to-blue-500 bg-clip-text text-transparent',
      label: '良好'
    };
  } else if (score >= 50) {
    // 普通 - 绿灰色
    return {
      bg: 'bg-stone-50 border-stone-200/60',
      text: 'text-stone-600',
      label: '普通'
    };
  } else {
    // 较低 - 灰色
    return {
      bg: 'bg-stone-50 border-stone-100',
      text: 'text-stone-400',
      label: '一般'
    };
  }
}

export function TweetCard({ tweet, index, showComments = true, collapsible = false, isNew = false }: TweetCardProps) {
  const [activeTab, setActiveTab] = useState<number>(0);
  const [copied, setCopied] = useState(false);
  const [commentsExpanded, setCommentsExpanded] = useState(false);

  const languageMap: Record<string, { flag: string; label: string }> = {
    en: { flag: '🇺🇸', label: '英语' },
    ja: { flag: '🇯🇵', label: '日语' },
    zh: { flag: '🇨🇳', label: '中文' },
    ko: { flag: '🇰🇷', label: '韩语' },
    fr: { flag: '🇫🇷', label: '法语' },
    de: { flag: '🇩🇪', label: '德语' },
    es: { flag: '🇪🇸', label: '西班牙语' },
    pt: { flag: '🇵🇹', label: '葡萄牙语' },
    ru: { flag: '🇷🇺', label: '俄语' },
    other: { flag: '🌐', label: '其他' }
  };
  
  // Reset expanded state when collapsible changes
  useEffect(() => {
    setCommentsExpanded(!collapsible && showComments);
  }, [collapsible, showComments]);
  
  // Check if tweet has comments to show
  const hasComments = tweet.comments?.options?.length || tweet.commentSkipped || tweet.commentError;

  const groupLabels: Record<string, string> = {
    pain: '痛点',
    reach: '传播',
    kol: 'KOL',
    sentiment: '舆情',
    insight: '洞察'
  };
  const groupLabel = tweet.originalGroup === 'kol' ? 'KOL' : groupLabels[tweet.group] || tweet.group;
  
  // Group color based on group type
  const getGroupColor = () => {
    if (tweet.group === 'pain') return 'bg-rose-50 text-rose-700 border border-rose-200/50';
    if (tweet.originalGroup === 'kol') return 'bg-purple-50 text-purple-700 border border-purple-200/50';
    if (tweet.group === 'sentiment') return 'bg-orange-50 text-orange-700 border border-orange-200/50';
    if (tweet.group === 'insight') return 'bg-cyan-50 text-cyan-700 border border-cyan-200/50';
    return 'bg-sky-50 text-sky-700 border border-sky-200/50';
  };
  const groupColor = getGroupColor();
  
  // Sentiment label styling
  const getSentimentStyle = () => {
    switch (tweet.sentimentLabel) {
      case 'negative':
        return { label: '需关注', color: 'bg-red-100 text-red-700 border border-red-300', icon: '⚠️' };
      case 'positive':
        return { label: '积极', color: 'bg-green-50 text-green-700 border border-green-200', icon: '✓' };
      case 'neutral':
        return { label: '中性', color: 'bg-stone-100 text-stone-600 border border-stone-200', icon: '○' };
      default:
        return null;
    }
  };
  const sentimentStyle = getSentimentStyle();
  
  // Insight type label styling
  const getInsightStyle = () => {
    switch (tweet.insightType) {
      case 'feature_request':
        return { label: '功能需求', color: 'bg-amber-50 text-amber-700 border border-amber-200' };
      case 'competitor_praise':
        return { label: '竞品好评', color: 'bg-indigo-50 text-indigo-700 border border-indigo-200' };
      case 'ai_demand':
        return { label: 'AI需求', color: 'bg-cyan-50 text-cyan-700 border border-cyan-200' };
      default:
        return null;
    }
  };
  const insightStyle = getInsightStyle();
  
  const authorHandle = tweet.author?.startsWith('@') ? tweet.author : `@${tweet.author}`;
  const authorUrl = `https://x.com/${authorHandle.slice(1)}`;
  const initial = authorHandle.replace('@', '').charAt(0).toUpperCase();

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Sort options and find recommended
  const angleOrder = ['witty', 'practical', 'subtle_product'];
  const sortedOptions = tweet.comments?.options 
    ? [...tweet.comments.options].sort((a, b) => 
        angleOrder.indexOf(a.angle) - angleOrder.indexOf(b.angle)
      )
    : [];
  
  const recommendedIndex = sortedOptions.findIndex(opt => opt.recommended);
  
  // Set initial active tab when tweet changes
  useEffect(() => {
    if (recommendedIndex >= 0) {
      setActiveTab(recommendedIndex);
    } else {
      setActiveTab(0);
    }
  }, [tweet.url, recommendedIndex]);

  const tabLabels: Record<string, string> = {
    witty: '机智风格',
    practical: '务实风格',
    subtle_product: '产品植入'
  };
  const detectedLang = (tweet.detectedLanguage || 'unknown').toLowerCase();
  const languageInfo = languageMap[detectedLang] || { flag: '❔', label: '未知' };

  // Special styling for negative sentiment tweets
  const isNegativeSentiment = tweet.sentimentLabel === 'negative';
  const cardBorderClass = isNegativeSentiment 
    ? 'border-red-300 ring-2 ring-red-100' 
    : 'border-stone-200/80 hover:border-stone-300';
  
  return (
    <article className={`bg-white rounded-2xl border overflow-hidden hover:shadow-xl hover:shadow-stone-200/50 transition-all duration-300 card-hover break-inside-avoid relative ${cardBorderClass}`}>
      {/* Header */}
      <div className="p-6 pb-4 relative">
        {/* New Badge */}
        {isNew && (
          <span className="absolute top-3 right-3 z-10 px-2 py-0.5 text-[10px] sm:text-xs font-bold bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-full shadow-md shadow-emerald-500/25 animate-pulse-soft">
            New
          </span>
        )}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-full bg-gradient-to-br from-stone-100 to-stone-200 flex items-center justify-center text-stone-600 font-semibold text-lg border border-stone-200/50">
              {initial}
            </div>
            <div className="min-w-0">
              <a 
                href={authorUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="block max-w-[180px] truncate font-semibold text-stone-800 hover:text-amber-600 transition-colors sm:max-w-none"
              >
                {authorHandle}
              </a>
              <div className="hidden sm:flex flex-wrap items-center gap-1.5 mt-1.5">
                <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${groupColor}`}>
                  {groupLabel}
                </span>
                {/* Sentiment Label */}
                {sentimentStyle && (
                  <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1 ${sentimentStyle.color}`}>
                    <span>{sentimentStyle.icon}</span>
                    {sentimentStyle.label}
                  </span>
                )}
                {/* Insight Type Label */}
                {insightStyle && (
                  <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${insightStyle.color}`}>
                    {insightStyle.label}
                  </span>
                )}
                <span
                  className="text-xs text-stone-500 bg-stone-100 px-2.5 py-0.5 rounded-full border border-stone-200/50 flex items-center gap-1"
                  title={languageInfo.label}
                  aria-label={languageInfo.label}
                >
                  <span>{languageInfo.flag}</span>
                </span>
                {/* 发布时间戳 */}
                <span className="text-xs text-stone-500 bg-stone-100 px-2.5 py-0.5 rounded-full border border-stone-200/50 flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  {formatRelativeTime(tweet.datetime)}
                </span>
                {tweet.aiPicked !== false && (
                  <span className="text-xs font-semibold text-amber-700 bg-gradient-to-r from-amber-100 to-orange-100 px-2.5 py-0.5 rounded-full flex items-center gap-1 border border-amber-200/50">
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2L9.19 8.63L2 9.24L7.46 13.97L5.82 21L12 17.27L18.18 21L16.54 13.97L22 9.24L14.81 8.63L12 2Z"/>
                    </svg>
                    精选
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="hidden sm:block shrink-0">
            {(() => {
              const scoreStyle = getScoreStyle(tweet.finalScore);
              return (
                <div className={`text-right px-3 py-2 rounded-xl border ${scoreStyle.bg}`}>
                  <div className={`text-xl font-bold ${scoreStyle.text}`}>
                    {formatNumber(tweet.finalScore)}
                  </div>
                  <div className="text-xs text-stone-400 uppercase tracking-wide">Score</div>
                </div>
              );
            })()}
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:hidden">
            <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${groupColor}`}>
              {groupLabel}
            </span>
            {/* Sentiment Label - Mobile */}
            {sentimentStyle && (
              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1 ${sentimentStyle.color}`}>
                <span>{sentimentStyle.icon}</span>
                {sentimentStyle.label}
              </span>
            )}
            {/* Insight Type Label - Mobile */}
            {insightStyle && (
              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${insightStyle.color}`}>
                {insightStyle.label}
              </span>
            )}
            <span
              className="text-xs text-stone-500 bg-stone-100 px-2.5 py-0.5 rounded-full border border-stone-200/50 flex items-center gap-1"
              title={languageInfo.label}
              aria-label={languageInfo.label}
            >
              <span>{languageInfo.flag}</span>
            </span>
            <span className="text-xs text-stone-500 bg-stone-100 px-2.5 py-0.5 rounded-full border border-stone-200/50 flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {formatRelativeTime(tweet.datetime)}
            </span>
            {tweet.aiPicked !== false && (
              <span className="text-xs font-semibold text-amber-700 bg-gradient-to-r from-amber-100 to-orange-100 px-2.5 py-0.5 rounded-full flex items-center gap-1 border border-amber-200/50">
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2L9.19 8.63L2 9.24L7.46 13.97L5.82 21L12 17.27L18.18 21L16.54 13.97L22 9.24L14.81 8.63L12 2Z"/>
                </svg>
                精选
              </span>
            )}
            <div className="ml-auto shrink-0">
              {(() => {
                const scoreStyle = getScoreStyle(tweet.finalScore);
                return (
                  <div className={`text-right px-3 py-2 rounded-xl border ${scoreStyle.bg}`}>
                    <div className={`text-xl font-bold ${scoreStyle.text}`}>
                      {formatNumber(tweet.finalScore)}
                    </div>
                    <div className="text-xs text-stone-400 uppercase tracking-wide">Score</div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-6 pb-4">
        <div className="bg-gradient-to-r from-stone-50 to-stone-100/50 rounded-xl p-4 border-l-4 border-stone-300">
          <p className="text-stone-700 text-sm leading-relaxed whitespace-pre-wrap">
            {tweet.text || '无内容'}
          </p>
        </div>

        {/* Translation */}
        {tweet.comments?.tweetTranslationZh && tweet.detectedLanguage !== 'zh' && (
          <div className="mt-3 bg-gradient-to-r from-sky-50 to-cyan-50 rounded-xl p-4 border-l-4 border-sky-400">
            <div className="flex items-center gap-1.5 text-sky-600 text-xs font-semibold mb-2">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 19l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"/>
              </svg>
              中文翻译
            </div>
            <p className="text-sky-900 text-sm leading-relaxed">
              {tweet.comments.tweetTranslationZh}
            </p>
          </div>
        )}

        {/* Metrics */}
        <div className="flex flex-wrap items-center gap-3 sm:gap-4 mt-4 text-stone-500">
          <div className="flex items-center gap-1.5 text-sm hover:text-rose-500 transition-colors cursor-default">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
            <span className="font-medium">{formatNumber(tweet.likes)}</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm hover:text-emerald-500 transition-colors cursor-default">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M23.77 15.67c-.292-.293-.767-.293-1.06 0l-2.22 2.22V7.65c0-2.068-1.683-3.75-3.75-3.75h-5.85c-.414 0-.75.336-.75.75s.336.75.75.75h5.85c1.24 0 2.25 1.01 2.25 2.25v10.24l-2.22-2.22c-.293-.293-.768-.293-1.06 0s-.294.768 0 1.06l3.5 3.5c.145.147.337.22.53.22s.383-.072.53-.22l3.5-3.5c.294-.292.294-.767 0-1.06zm-10.66 3.28H7.26c-1.24 0-2.25-1.01-2.25-2.25V6.46l2.22 2.22c.148.147.34.22.532.22s.384-.073.53-.22c.293-.293.293-.768 0-1.06l-3.5-3.5c-.293-.294-.768-.294-1.06 0l-3.5 3.5c-.294.292-.294.767 0 1.06s.767.293 1.06 0l2.22-2.22V16.7c0 2.068 1.683 3.75 3.75 3.75h5.85c.414 0 .75-.336.75-.75s-.337-.75-.75-.75z"/>
            </svg>
            <span className="font-medium">{formatNumber(tweet.retweets)}</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm hover:text-sky-500 transition-colors cursor-default">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M14.046 2.242l-4.148-.01h-.002c-4.374 0-7.8 3.427-7.8 7.802 0 4.098 3.186 7.206 7.465 7.37v3.828c0 .108.044.286.12.403.142.225.384.347.632.347.138 0 .277-.038.402-.118.264-.168 6.473-4.14 8.088-5.506 1.902-1.61 3.04-3.97 3.043-6.312v-.017c-.006-4.367-3.43-7.787-7.8-7.788zm3.787 12.972c-1.134.96-4.862 3.405-6.772 4.643V16.67c0-.414-.335-.75-.75-.75h-.396c-3.66 0-6.318-2.476-6.318-5.886 0-3.534 2.768-6.302 6.3-6.302l4.147.01h.002c3.532 0 6.3 2.766 6.302 6.296-.003 1.91-.942 3.844-2.514 5.176z"/>
            </svg>
            <span className="font-medium">{formatNumber(tweet.replies)}</span>
          </div>
          <a 
            href={tweet.url} 
            target="_blank" 
            rel="noopener noreferrer"
            className="w-full sm:w-auto sm:ml-auto inline-flex items-center justify-center gap-2 px-5 py-2 bg-gradient-to-r from-stone-800 to-stone-900 text-white text-sm font-medium rounded-full hover:from-stone-700 hover:to-stone-800 transition-all shadow-lg shadow-stone-900/20 hover:shadow-stone-900/30"
          >
            查看原推文
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </div>
      </div>

      {/* Comments Section */}
      {(showComments || collapsible) && hasComments && (
        <div className="bg-gradient-to-b from-stone-50 to-stone-100/50 border-t border-stone-200/80">
          {/* Collapsible Toggle */}
          {collapsible && (
            <button
              onClick={() => setCommentsExpanded(!commentsExpanded)}
              className="w-full px-6 py-3.5 flex items-center justify-between text-sm font-medium text-stone-600 hover:bg-stone-100/80 transition-colors"
            >
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                查看回复建议
              </span>
              <svg 
                className={`w-4 h-4 transition-transform duration-300 ${commentsExpanded ? 'rotate-180' : ''}`}
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          )}
          
          {/* Comments Content */}
          {(collapsible ? commentsExpanded : showComments) && (
            <div className="p-6 pt-4">
              {tweet.commentSkipped ? (
                <div className="bg-amber-50 border border-amber-200/80 rounded-xl p-4 text-amber-800 text-sm">
                  <strong>已跳过：</strong> {tweet.skipReason}
                  {tweet.skipReasonZh && (
                    <p className="mt-1 opacity-80">{tweet.skipReasonZh}</p>
                  )}
                </div>
              ) : tweet.commentError ? (
                <div className="bg-red-50 border border-red-200/80 rounded-xl p-4 text-red-800 text-sm">
                  <strong>生成失败：</strong> {tweet.commentError}
                </div>
              ) : tweet.comments?.options?.length ? (
                <>
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">回复建议</span>
                    <div className="flex-1 h-px bg-gradient-to-r from-stone-200 to-transparent"></div>
                  </div>
                  
                  {/* Tabs with sliding indicator */}
                  <div className="relative flex p-1.5 bg-stone-100 rounded-2xl border border-stone-200/80 mb-4 shadow-sm">
                    {/* Sliding background indicator */}
                    <div 
                      className="absolute top-1.5 bottom-1.5 rounded-xl transition-all duration-300 ease-out"
                      style={{
                        width: `calc((100% - 12px) / ${sortedOptions.length})`,
                        left: `calc(6px + ${activeTab} * (100% - 12px) / ${sortedOptions.length})`,
                        background: sortedOptions[activeTab]?.recommended 
                          ? 'linear-gradient(to right, #f59e0b, #f97316)' 
                          : 'white',
                        boxShadow: sortedOptions[activeTab]?.recommended
                          ? '0 4px 6px -1px rgba(245, 158, 11, 0.25), 0 2px 4px -2px rgba(245, 158, 11, 0.15)'
                          : '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)'
                      }}
                    />
                    {sortedOptions.map((opt, i) => (
                      <button
                        key={opt.angle}
                        onClick={() => setActiveTab(i)}
                        className={`relative z-10 flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors duration-200 ${
                          activeTab === i
                            ? opt.recommended
                              ? 'text-white'
                              : 'text-stone-800'
                            : opt.recommended
                              ? 'text-amber-600 hover:text-amber-700'
                              : 'text-stone-500 hover:text-stone-700'
                        }`}
                      >
                        {opt.recommended && (
                          <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${activeTab === i ? 'scale-110' : ''}`} viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2L9.19 8.63L2 9.24L7.46 13.97L5.82 21L12 17.27L18.18 21L16.54 13.97L22 9.24L14.81 8.63L12 2Z"/>
                          </svg>
                        )}
                        {tabLabels[opt.angle] || opt.angle}
                      </button>
                    ))}
                  </div>

                  {/* Active Option */}
                  {sortedOptions[activeTab] && (
                    <ReplyOptionCard
                      option={sortedOptions[activeTab]}
                      isRecommended={sortedOptions[activeTab].recommended}
                      onCopy={handleCopy}
                    />
                  )}
                </>
              ) : (
                <div className="text-center text-stone-400 text-sm py-6">
                  暂无回复建议
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Toast */}
      {copied && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-gradient-to-r from-stone-800 to-stone-900 text-white px-6 py-3 rounded-xl shadow-2xl z-50 animate-fade-in flex items-center gap-2">
          <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          已复制到剪贴板
        </div>
      )}
    </article>
  );
}
