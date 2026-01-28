'use client';

import { ViewMode } from '@/lib/types';

interface ViewToggleProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}

const viewOptions: { mode: ViewMode; label: string; icon: React.ReactNode }[] = [
  {
    mode: 'card',
    label: '卡片',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
      </svg>
    )
  },
  {
    mode: 'list',
    label: '列表',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    )
  },
  {
    mode: 'timeline',
    label: '时间线',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )
  }
];

export function ViewToggle({ value, onChange }: ViewToggleProps) {
  return (
    <div className="inline-flex bg-stone-100 rounded-2xl p-1 border border-stone-200/50">
      {viewOptions.map(option => (
        <button
          key={option.mode}
          onClick={() => onChange(option.mode)}
          className={`flex items-center justify-center gap-2 px-3 h-9 rounded-xl text-sm font-medium whitespace-nowrap transition-all duration-200 ${
            value === option.mode
              ? 'bg-white text-stone-800 shadow-md border border-stone-200/50'
              : 'text-stone-500 hover:text-stone-700 hover:bg-stone-50'
          }`}
        >
          {option.icon}
          <span className="whitespace-nowrap">{option.label}</span>
        </button>
      ))}
    </div>
  );
}
