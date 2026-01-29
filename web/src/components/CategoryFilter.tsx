'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CategoryFilter as CategoryFilterType, RadarCategory, Tweet } from '@/lib/types';
import { isTweetNew, TweetStats } from '@/lib/data';

interface CategoryFilterProps {
  value: CategoryFilterType[];
  onChange: (categories: CategoryFilterType[]) => void;
  stats?: TweetStats;
  radarCategory?: RadarCategory;
  radarFilteredTweets?: Tweet[];
  recentRunAts?: string[];
}

type FilterOption = { key: CategoryFilterType; label: string; color: string; activeColor: string };

// Pain Radar filters
const painRadarFilters: FilterOption[] = [
  { key: 'all', label: '全部', color: 'bg-stone-500', activeColor: 'bg-gradient-to-r from-stone-700 to-stone-800' },
  { key: 'new', label: '新推文', color: 'bg-emerald-500', activeColor: 'bg-gradient-to-r from-emerald-500 to-teal-500' },
  { key: 'pain', label: '痛点', color: 'bg-rose-500', activeColor: 'bg-gradient-to-r from-rose-500 to-rose-600' },
  { key: 'reach', label: '传播', color: 'bg-sky-500', activeColor: 'bg-gradient-to-r from-sky-500 to-sky-600' },
  { key: 'kol', label: 'KOL', color: 'bg-purple-500', activeColor: 'bg-gradient-to-r from-purple-500 to-purple-600' },
];

// Sentiment filters (Filo舆情)
const sentimentFilters: FilterOption[] = [
  { key: 'all', label: '全部', color: 'bg-stone-500', activeColor: 'bg-gradient-to-r from-stone-700 to-stone-800' },
  { key: 'new', label: '新推文', color: 'bg-emerald-500', activeColor: 'bg-gradient-to-r from-emerald-500 to-teal-500' },
  { key: 'negative', label: '需关注', color: 'bg-red-500', activeColor: 'bg-gradient-to-r from-red-500 to-red-600' },
  { key: 'positive', label: '积极', color: 'bg-green-500', activeColor: 'bg-gradient-to-r from-green-500 to-green-600' },
  { key: 'neutral', label: '中性', color: 'bg-stone-400', activeColor: 'bg-gradient-to-r from-stone-500 to-stone-600' },
];

// Insight filters (用户洞察)
const insightFilters: FilterOption[] = [
  { key: 'all', label: '全部', color: 'bg-stone-500', activeColor: 'bg-gradient-to-r from-stone-700 to-stone-800' },
  { key: 'new', label: '新推文', color: 'bg-emerald-500', activeColor: 'bg-gradient-to-r from-emerald-500 to-teal-500' },
  { key: 'feature_request', label: '功能需求', color: 'bg-amber-500', activeColor: 'bg-gradient-to-r from-amber-500 to-amber-600' },
  { key: 'competitor_praise', label: '竞品好评', color: 'bg-indigo-500', activeColor: 'bg-gradient-to-r from-indigo-500 to-indigo-600' },
  { key: 'ai_demand', label: 'AI需求', color: 'bg-cyan-500', activeColor: 'bg-gradient-to-r from-cyan-500 to-cyan-600' },
];

export function CategoryFilter({ value, onChange, stats, radarCategory = 'pain_radar', radarFilteredTweets = [], recentRunAts = [] }: CategoryFilterProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Select filters based on radar category
  const categories = useMemo(() => {
    switch (radarCategory) {
      case 'filo_sentiment':
        return sentimentFilters;
      case 'user_insight':
        return insightFilters;
      default:
        return painRadarFilters;
    }
  }, [radarCategory]);

  const handleClick = (key: CategoryFilterType) => {
    if (key === 'all') {
      onChange(['all']);
    } else {
      const newValue = value.filter(v => v !== 'all');
      if (newValue.includes(key)) {
        const filtered = newValue.filter(v => v !== key);
        onChange(filtered.length ? filtered : ['all']);
      } else {
        onChange([...newValue, key]);
      }
    }
  };

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const getCount = (key: CategoryFilterType): number | undefined => {
    // For pain radar, use stats
    if (radarCategory === 'pain_radar' && stats) {
      switch (key) {
        case 'all': return stats.total;
        case 'new': return stats.byCategory.new;
        case 'pain': return stats.byCategory.pain;
        case 'reach': return stats.byCategory.reach;
        case 'kol': return stats.byCategory.kol;
      }
    }
    
    // For sentiment and insight, count from radarFilteredTweets
    if (radarCategory === 'filo_sentiment') {
      switch (key) {
        case 'all': return radarFilteredTweets.length;
        case 'new': return radarFilteredTweets.filter(t => isTweetNew(t, recentRunAts)).length;
        case 'positive': return radarFilteredTweets.filter(t => t.sentimentLabel === 'positive').length;
        case 'negative': return radarFilteredTweets.filter(t => t.sentimentLabel === 'negative').length;
        case 'neutral': return radarFilteredTweets.filter(t => t.sentimentLabel === 'neutral').length;
      }
    }
    
    if (radarCategory === 'user_insight') {
      switch (key) {
        case 'all': return radarFilteredTweets.length;
        case 'new': return radarFilteredTweets.filter(t => isTweetNew(t, recentRunAts)).length;
        case 'feature_request': return radarFilteredTweets.filter(t => t.insightType === 'feature_request').length;
        case 'competitor_praise': return radarFilteredTweets.filter(t => t.insightType === 'competitor_praise').length;
        case 'ai_demand': return radarFilteredTweets.filter(t => t.insightType === 'ai_demand').length;
      }
    }
    
    return undefined;
  };

  const selectedLabel = useMemo(() => {
    if (value.includes('all') || value.length === 0) return '全部';
    return categories
      .filter(cat => cat.key !== 'all' && value.includes(cat.key))
      .map(cat => cat.label)
      .join(' / ') || '全部';
  }, [value, categories]);

  return (
    <div ref={containerRef} className="relative inline-flex items-center shrink-0">
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-sm font-medium bg-stone-100 text-stone-600 hover:bg-stone-200 transition-colors whitespace-nowrap"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="text-stone-500">分类</span>
        <span className="text-stone-700 max-w-[100px] truncate">{selectedLabel}</span>
        <svg className={`w-3.5 h-3.5 text-stone-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <>
          {/* Mobile backdrop */}
          <div 
            className="fixed inset-0 bg-black/20 z-40 sm:hidden" 
            onClick={() => setOpen(false)}
          />
          {/* Dropdown */}
          <div
            role="listbox"
            className="fixed left-4 right-4 top-1/3 z-50 w-auto max-w-[240px] mx-auto rounded-xl bg-white border border-stone-200 shadow-lg p-1.5 sm:absolute sm:left-0 sm:right-auto sm:top-full sm:mt-2 sm:w-48 sm:max-w-none sm:mx-0"
          >
            <div className="text-xs text-stone-400 px-2 py-1 sm:hidden">选择分类</div>
            {categories.map(cat => {
              const isActive = value.includes(cat.key);
              const count = getCount(cat.key);

              return (
                <button
                  key={cat.key}
                  onClick={() => handleClick(cat.key)}
                  className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-stone-800 text-white'
                      : 'text-stone-600 hover:bg-stone-100'
                  }`}
                  role="option"
                  aria-selected={isActive}
                >
                  <span className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${cat.color}`} />
                    {cat.label}
                  </span>
                  {count !== undefined && (
                    <span className={`text-xs ${
                      isActive ? 'text-stone-300' : 'text-stone-400'
                    }`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
