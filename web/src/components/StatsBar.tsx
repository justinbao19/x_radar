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
    <div className="bg-white/80 backdrop-blur-sm border-b border-stone-200/60 relative z-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-6 md:gap-8">
        {/* Stats Cards */}
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center sm:gap-2">
          <div className="flex items-center gap-2 bg-gradient-to-r from-amber-50 to-orange-50 px-3 py-2 sm:px-4 rounded-2xl border border-amber-200/50 w-full sm:w-auto sm:min-w-[180px]">
            <div className="w-7 h-7 sm:w-8 sm:h-8 bg-amber-500 rounded-xl flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2L9.19 8.63L2 9.24L7.46 13.97L5.82 21L12 17.27L18.18 21L16.54 13.97L22 9.24L14.81 8.63L12 2Z"/>
            </svg>
          </div>
            <div>
              <span className="text-xl sm:text-2xl font-bold text-stone-800">
                {showAiPicked ? stats.aiPicked : stats.total}
              </span>
              <span className="text-xs sm:text-sm text-stone-500 ml-1.5">
                {showAiPicked ? 'AI 精选' : '全部推文'}
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-2 bg-stone-50 px-3 py-2 sm:px-4 rounded-2xl border border-stone-200/50 w-full sm:w-auto sm:min-w-[200px]">
            <div className="w-7 h-7 sm:w-8 sm:h-8 bg-emerald-500 rounded-xl flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
            <div>
              <span className="text-xl sm:text-2xl font-bold text-stone-800">{stats.withComments}</span>
              <span className="text-xs sm:text-sm text-stone-500 ml-1.5">已生成回复</span>
            </div>
          </div>
        </div>
        
        {languageCount > 0 && (
          <div ref={langRef} className="relative hidden md:flex items-center bg-stone-50 px-3 py-2 rounded-2xl border border-stone-200/50 z-30">
            <button
              type="button"
              onClick={() => setLangOpen(prev => !prev)}
              className="flex items-center gap-3"
              aria-haspopup="dialog"
              aria-expanded={langOpen}
            >
              <div className="w-8 h-8 bg-blue-500 rounded-xl flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 19l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"/>
                </svg>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex -space-x-2">
                  {activeFlag ? (
                    <span className="w-6 h-6 rounded-full bg-white border border-stone-200 flex items-center justify-center text-xs">
                      {activeFlag}
                    </span>
                  ) : (
                    <>
                      {previewFlags.map(item => (
                        <span
                          key={item.code}
                          className="w-6 h-6 rounded-full bg-white border border-stone-200 flex items-center justify-center text-xs"
                        >
                          {item.flag}
                        </span>
                      ))}
                      {languageCount > previewFlags.length && (
                        <span className="w-6 h-6 rounded-full bg-white border border-stone-200 flex items-center justify-center text-[10px] text-stone-500">
                          +{languageCount - previewFlags.length}
                        </span>
                      )}
                    </>
                  )}
                </div>
                <span className="text-sm font-semibold text-stone-700 whitespace-nowrap">
                  {labelText}
                </span>
              </div>
              <svg className={`w-4 h-4 text-stone-400 transition-transform ${langOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {langOpen && (
              <div className="absolute right-0 top-full mt-2 w-64 rounded-2xl bg-white border border-stone-200 shadow-lg shadow-stone-200/50 p-2 z-50">
                <div className="text-xs text-stone-500 px-2 py-1">语言分布</div>
                <div className="max-h-56 overflow-auto">
                  <button
                    type="button"
                    onClick={() => {
                      onLanguageChange('all');
                      setLangOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-2 py-1.5 rounded-xl text-sm transition-colors ${
                      languageFilter === 'all'
                        ? 'bg-stone-100 text-stone-800'
                        : 'text-stone-600 hover:bg-stone-50'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-stone-100 border border-stone-200 flex items-center justify-center text-xs">
                        🌐
                      </span>
                      全部语言
                    </span>
                    <span className="text-stone-500">{languageCount}</span>
                  </button>
                  {languages.map(item => (
                    <button
                      key={item.code}
                      type="button"
                      onClick={() => {
                        onLanguageChange(item.key);
                        setLangOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-2 py-1.5 rounded-xl text-sm transition-colors ${
                        activeLanguage === item.key
                          ? 'bg-amber-50 text-amber-700'
                          : 'text-stone-700 hover:bg-stone-50'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-stone-100 border border-stone-200 flex items-center justify-center text-xs">
                          {item.flag}
                        </span>
                        {item.label}
                      </span>
                      <span className="text-stone-500">{item.count}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* Toggle Switch */}
        <div className="flex flex-wrap items-center justify-between sm:justify-start gap-2 bg-stone-100/80 px-3 py-2 rounded-2xl w-full sm:w-auto sm:ml-auto">
          <span className={`text-xs sm:text-sm font-medium transition-colors ${!showAiPicked ? 'text-stone-600' : 'text-stone-400'}`}>
            全部
          </span>
          <button
            onClick={onToggleAiPicked}
            className={`relative w-12 h-6 rounded-full transition-all duration-300 shrink-0 ${
              showAiPicked 
                ? 'bg-gradient-to-r from-amber-400 to-orange-500 shadow-inner shadow-amber-600/20' 
                : 'bg-stone-300'
            }`}
            aria-label={showAiPicked ? '显示全部推文' : '仅显示AI精选'}
          >
            <span 
              className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-all duration-300 ease-out ${
                showAiPicked ? 'left-6 shadow-amber-200' : 'left-0.5'
              }`}
            />
          </button>
          <span className={`text-xs sm:text-sm font-medium transition-colors ${showAiPicked ? 'text-amber-600' : 'text-stone-400'}`}>
            AI 精选
          </span>
        </div>
      </div>
    </div>
  );
}
