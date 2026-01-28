'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { TweetStats } from '@/lib/data';
import { LanguageFilter } from '@/lib/types';

interface StatsBarProps {
  stats: TweetStats;
  showAiPicked: boolean;
  onToggleAiPicked: () => void;
  languageFilter: LanguageFilter;
  onLanguageChange: (language: LanguageFilter) => void;
}

export function StatsBar({ stats, showAiPicked, onToggleAiPicked, languageFilter, onLanguageChange }: StatsBarProps) {
  const [langOpen, setLangOpen] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);
  const languages = useMemo(() => {
    const flagMap: Record<string, string> = {
      en: '🇺🇸',
      ja: '🇯🇵',
      zh: '🇨🇳',
      ko: '🇰🇷',
      fr: '🇫🇷',
      de: '🇩🇪',
      es: '🇪🇸',
      pt: '🇵🇹',
      ru: '🇷🇺',
      other: '🧩',
      unknown: '❔'
    };
    const nameMap: Record<string, string> = {
      en: '英语',
      ja: '日语',
      zh: '中文',
      ko: '韩语',
      fr: '法语',
      de: '德语',
      es: '西班牙语',
      pt: '葡萄牙语',
      ru: '俄语',
      other: '其他',
      unknown: '未知'
    };
    return Object.entries(stats.byLanguage)
      .map(([lang, count]) => ({
        key: lang.toLowerCase(),
        code: lang.toUpperCase(),
        count,
        flag: flagMap[lang.toLowerCase()] || '🌐',
        label: nameMap[lang.toLowerCase()] || '未知'
      }))
      .filter(item => item.count > 0)
      .sort((a, b) => {
        const tailKeys = new Set(['other', 'unknown']);
        const aIsTail = tailKeys.has(a.key);
        const bIsTail = tailKeys.has(b.key);
        if (aIsTail !== bIsTail) return aIsTail ? 1 : -1;
        return b.count - a.count;
      });
  }, [stats.byLanguage]);
  const languageCount = languages.length;
  const previewFlags = languages.slice(0, 4);
  const activeLanguage = languageFilter && languageFilter !== 'all'
    ? languageFilter.toLowerCase()
    : null;
  const activeFlag = activeLanguage
    ? languages.find(item => item.key === activeLanguage)?.flag || '🌐'
    : null;
  const activeLabel = activeLanguage
    ? languages.find(item => item.key === activeLanguage)?.label || '未知'
    : null;
  const labelText = activeLanguage
    ? `筛选：${activeLabel}`
    : `共 ${languageCount} 种语言`;

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (!langRef.current) return;
      if (!langRef.current.contains(event.target as Node)) {
        setLangOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  return (
    <div className="bg-stone-50/80 backdrop-blur-sm border-b border-stone-200/60 relative z-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-2.5 sm:py-3">
        {/* Mobile: Two rows layout */}
        <div className="flex flex-col gap-2 sm:hidden">
          {/* Row 1: Stats + Toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 bg-stone-100 px-3 h-8 rounded-lg">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                <span className="text-sm font-semibold text-stone-800">
                  {showAiPicked ? stats.aiPicked : stats.total}
                </span>
                <span className="text-sm text-stone-500">
                  {showAiPicked ? '精选' : '全部'}
                </span>
              </div>
              <div className="flex items-center gap-1.5 bg-stone-100 px-3 h-8 rounded-lg">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-sm font-semibold text-stone-800">{stats.withComments}</span>
                <span className="text-sm text-stone-500">回复</span>
              </div>
            </div>
            {/* Toggle Switch */}
            <div className="flex items-center gap-1.5 bg-stone-100 px-2.5 h-8 rounded-lg">
              <span className={`text-sm font-medium transition-colors ${!showAiPicked ? 'text-stone-700' : 'text-stone-400'}`}>
                全部
              </span>
              <button
                onClick={onToggleAiPicked}
                className={`relative w-9 h-5 rounded-full transition-all duration-200 ${
                  showAiPicked ? 'bg-amber-500' : 'bg-stone-300'
                }`}
                aria-label={showAiPicked ? '显示全部推文' : '仅显示AI精选'}
              >
                <span 
                  className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all duration-200 ${
                    showAiPicked ? 'left-[18px]' : 'left-0.5'
                  }`}
                />
              </button>
              <span className={`text-sm font-medium transition-colors ${showAiPicked ? 'text-amber-600' : 'text-stone-400'}`}>
                精选
              </span>
            </div>
          </div>
          {/* Row 2: Language selector (if needed) */}
          {languageCount > 0 && (
            <div ref={langRef} className="relative">
              <button
                type="button"
                onClick={() => setLangOpen(prev => !prev)}
                className="flex items-center gap-1.5 bg-stone-100 px-3 h-8 rounded-lg text-sm text-stone-600"
                aria-haspopup="dialog"
                aria-expanded={langOpen}
              >
                <div className="flex -space-x-1">
                  {activeFlag ? (
                    <span className="text-sm">{activeFlag}</span>
                  ) : (
                    previewFlags.slice(0, 3).map(item => (
                      <span key={item.code} className="text-sm">{item.flag}</span>
                    ))
                  )}
                </div>
                <span className="text-sm text-stone-500">
                  {activeLabel || `${languageCount}种语言`}
                </span>
                <svg className={`w-3.5 h-3.5 text-stone-400 transition-transform ${langOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* Desktop: Single row layout */}
        <div className="hidden sm:flex items-center gap-4">
          <div className="flex items-center gap-1.5 bg-stone-100 px-3 h-8 rounded-lg">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <span className="text-sm font-semibold text-stone-800">
              {showAiPicked ? stats.aiPicked : stats.total}
            </span>
            <span className="text-xs text-stone-500">
              {showAiPicked ? 'AI精选' : '全部'}
            </span>
          </div>
          
          <div className="flex items-center gap-1.5 bg-stone-100 px-3 h-8 rounded-lg">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-sm font-semibold text-stone-800">{stats.withComments}</span>
            <span className="text-xs text-stone-500">已回复</span>
          </div>
          
          <div className="flex-1" />
          
          {/* Language Selector - Desktop */}
          {languageCount > 0 && (
            <div ref={langRef} className="relative">
              <button
                type="button"
                onClick={() => setLangOpen(prev => !prev)}
                className="flex items-center gap-1.5 bg-stone-100 px-3 h-8 rounded-lg text-sm text-stone-600 hover:bg-stone-200 transition-colors"
                aria-haspopup="dialog"
                aria-expanded={langOpen}
              >
                <div className="flex -space-x-1">
                  {activeFlag ? (
                    <span className="text-sm">{activeFlag}</span>
                  ) : (
                    previewFlags.slice(0, 3).map(item => (
                      <span key={item.code} className="text-sm">{item.flag}</span>
                    ))
                  )}
                </div>
                {languageCount > 3 && !activeFlag && (
                  <span className="text-xs text-stone-400">+{languageCount - 3}</span>
                )}
                <svg className={`w-3.5 h-3.5 text-stone-400 transition-transform ${langOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
          )}
          
          {/* Toggle Switch - Desktop */}
          <div className="flex items-center gap-1.5 bg-stone-100 px-2 h-8 rounded-lg">
            <span className={`text-xs font-medium transition-colors ${!showAiPicked ? 'text-stone-700' : 'text-stone-400'}`}>
              全部
            </span>
            <button
              onClick={onToggleAiPicked}
              className={`relative w-9 h-5 rounded-full transition-all duration-200 ${
                showAiPicked ? 'bg-amber-500' : 'bg-stone-300'
              }`}
              aria-label={showAiPicked ? '显示全部推文' : '仅显示AI精选'}
            >
              <span 
                className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all duration-200 ${
                  showAiPicked ? 'left-[18px]' : 'left-0.5'
                }`}
              />
            </button>
            <span className={`text-xs font-medium transition-colors ${showAiPicked ? 'text-amber-600' : 'text-stone-400'}`}>
              精选
            </span>
          </div>
        </div>

        {/* Language Dropdown - Shared */}
        {langOpen && (
          <>
            <div 
              className="fixed inset-0 bg-black/20 z-40 sm:hidden" 
              onClick={() => setLangOpen(false)}
            />
            <div className="fixed left-4 right-4 top-1/3 z-50 max-w-[240px] mx-auto rounded-xl bg-white border border-stone-200 shadow-lg p-1.5 sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-52 sm:max-w-none sm:mx-0">
              <div className="text-xs text-stone-400 px-2 py-1">语言筛选</div>
              <div className="max-h-52 overflow-auto">
                <button
                  type="button"
                  onClick={() => {
                    onLanguageChange('all');
                    setLangOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-sm transition-colors ${
                    languageFilter === 'all'
                      ? 'bg-stone-800 text-white'
                      : 'text-stone-600 hover:bg-stone-100'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="text-sm">🌐</span>
                    全部
                  </span>
                  <span className={languageFilter === 'all' ? 'text-stone-300' : 'text-stone-400'}>{languageCount}</span>
                </button>
                {languages.map(item => (
                  <button
                    key={item.code}
                    type="button"
                    onClick={() => {
                      onLanguageChange(item.key);
                      setLangOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-sm transition-colors ${
                      activeLanguage === item.key
                        ? 'bg-stone-800 text-white'
                        : 'text-stone-600 hover:bg-stone-100'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-sm">{item.flag}</span>
                      {item.label}
                    </span>
                    <span className={activeLanguage === item.key ? 'text-stone-300' : 'text-stone-400'}>{item.count}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
