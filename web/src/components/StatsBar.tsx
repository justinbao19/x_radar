'use client';

import { TweetStats } from '@/lib/data';

interface StatsBarProps {
  stats: TweetStats;
  showAiPicked: boolean;
  onToggleAiPicked: () => void;
}

export function StatsBar({ stats, showAiPicked, onToggleAiPicked }: StatsBarProps) {
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
      </div>
    </div>
  );
}
