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
    <div className="bg-white border-b border-slate-200">
      <div className="max-w-6xl mx-auto px-6 py-3 flex items-center gap-8">
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-bold text-slate-900">
            {showAiPicked ? stats.aiPicked : stats.total}
          </span>
          <span className="text-sm text-slate-500">
            {showAiPicked ? 'AI 精选' : '全部推文'}
          </span>
        </div>
        
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-bold text-slate-900">{stats.withComments}</span>
          <span className="text-sm text-slate-500">已生成</span>
        </div>
        
        {langDisplay && (
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-medium text-slate-700">{langDisplay}</span>
            <span className="text-sm text-slate-500">语言</span>
          </div>
        )}
        
        <div className="ml-auto flex items-center gap-3">
          <span className={`text-sm font-medium ${showAiPicked ? 'text-violet-600' : 'text-slate-500'}`}>
            AI 精选
          </span>
          <button
            onClick={onToggleAiPicked}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              showAiPicked ? 'bg-slate-300' : 'bg-violet-600'
            }`}
          >
            <span 
              className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                showAiPicked ? 'left-0.5' : 'left-5'
              }`}
            />
          </button>
          <span className={`text-sm font-medium ${!showAiPicked ? 'text-violet-600' : 'text-slate-500'}`}>
            全部
          </span>
        </div>
      </div>
    </div>
  );
}
