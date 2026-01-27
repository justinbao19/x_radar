'use client';

import { TweetStats } from '@/lib/data';

interface StatsBarProps {
  stats: TweetStats;
  showAiPicked: boolean;
  onToggleAiPicked: () => void;
}

export function StatsBar({ stats, showAiPicked, onToggleAiPicked }: StatsBarProps) {
  const langDisplay = Object.entries(stats.byLanguage)
    .map(([lang, count]) => `${lang.toUpperCase()} ${count}`)
    .join(' / ');

  return (
    <div className="bg-white/80 backdrop-blur-sm border-b border-stone-200/60">
      <div className="max-w-6xl mx-auto px-6 py-4 flex flex-wrap items-center gap-6 md:gap-8">
        {/* Stats Cards */}
        <div className="flex items-center gap-2 bg-gradient-to-r from-amber-50 to-orange-50 px-4 py-2 rounded-xl border border-amber-200/50">
          <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2L9.19 8.63L2 9.24L7.46 13.97L5.82 21L12 17.27L18.18 21L16.54 13.97L22 9.24L14.81 8.63L12 2Z"/>
            </svg>
          </div>
          <div>
            <span className="text-2xl font-bold text-stone-800">
              {showAiPicked ? stats.aiPicked : stats.total}
            </span>
            <span className="text-sm text-stone-500 ml-1.5">
              {showAiPicked ? 'AI 精选' : '全部推文'}
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-2 bg-stone-50 px-4 py-2 rounded-xl border border-stone-200/50">
          <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <span className="text-2xl font-bold text-stone-800">{stats.withComments}</span>
            <span className="text-sm text-stone-500 ml-1.5">已生成回复</span>
          </div>
        </div>
        
        {langDisplay && (
          <div className="hidden md:flex items-center gap-2 bg-stone-50 px-4 py-2 rounded-xl border border-stone-200/50">
            <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 19l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"/>
              </svg>
            </div>
            <div>
              <span className="text-sm font-semibold text-stone-700">{langDisplay}</span>
              <span className="text-xs text-stone-400 ml-1">语言</span>
            </div>
          </div>
        )}
        
        {/* Toggle Switch */}
        <div className="ml-auto flex items-center gap-3 bg-stone-100/80 px-4 py-2 rounded-xl">
          <span className={`text-sm font-medium transition-colors ${showAiPicked ? 'text-amber-600' : 'text-stone-400'}`}>
            AI 精选
          </span>
          <button
            onClick={onToggleAiPicked}
            className={`relative w-12 h-6 rounded-full transition-all duration-300 ${
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
          <span className={`text-sm font-medium transition-colors ${!showAiPicked ? 'text-stone-600' : 'text-stone-400'}`}>
            全部
          </span>
        </div>
      </div>
    </div>
  );
}
