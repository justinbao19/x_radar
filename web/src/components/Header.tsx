'use client';

import Link from 'next/link';
import { formatDateTime } from '@/lib/data';

interface HeaderProps {
  lastUpdated?: string;
}

export function Header({ lastUpdated }: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 bg-background/90 backdrop-blur-xl border-b border-stone-200/80">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
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
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <div className="hidden sm:flex items-center gap-2 text-[13px] bg-stone-50 border border-stone-200/60 px-3 py-1.5 rounded-full">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
              <span className="text-stone-400">更新于</span>
              <span className="text-stone-600 font-medium">{formatDateTime(lastUpdated)}</span>
            </div>
          )}
          <Link
            href="/review"
            className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-sm font-medium rounded-xl shadow-sm shadow-amber-500/20 transition-all active:scale-[0.97]"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
            <span className="hidden sm:inline">滑卡 Review</span>
            <span className="sm:hidden">Review</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
