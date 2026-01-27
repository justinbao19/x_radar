'use client';

import { formatDateTime } from '@/lib/data';

interface HeaderProps {
  lastUpdated?: string;
}

export function Header({ lastUpdated }: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 bg-[#FAF9F7]/90 backdrop-blur-xl border-b border-stone-200/80">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center shadow-lg shadow-black/20">
            <svg className="w-5 h-5 fill-white" viewBox="0 0 24 24">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
            </svg>
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-stone-800 text-lg tracking-tight">X Radar</span>
            <span className="text-xs text-stone-500 -mt-0.5">智能推文追踪</span>
          </div>
        </div>
        {lastUpdated && (
          <div className="flex items-center gap-2 text-sm text-stone-500 bg-stone-100/80 px-3 py-1.5 rounded-full">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
            更新于 {formatDateTime(lastUpdated)}
          </div>
        )}
      </div>
    </header>
  );
}
