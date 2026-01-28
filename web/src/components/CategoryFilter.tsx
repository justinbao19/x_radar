'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CategoryFilter as CategoryFilterType } from '@/lib/types';
import { TweetStats } from '@/lib/data';

interface CategoryFilterProps {
  value: CategoryFilterType[];
  onChange: (categories: CategoryFilterType[]) => void;
  stats?: TweetStats;
}

const categories: { key: CategoryFilterType; label: string; color: string; activeColor: string }[] = [
  { key: 'all', label: '全部', color: 'bg-stone-500', activeColor: 'bg-gradient-to-r from-stone-700 to-stone-800' },
  { key: 'new', label: '新推文', color: 'bg-emerald-500', activeColor: 'bg-gradient-to-r from-emerald-500 to-teal-500' },
  { key: 'pain', label: '痛点', color: 'bg-rose-500', activeColor: 'bg-gradient-to-r from-rose-500 to-rose-600' },
  { key: 'reach', label: '传播', color: 'bg-sky-500', activeColor: 'bg-gradient-to-r from-sky-500 to-sky-600' },
  { key: 'kol', label: 'KOL', color: 'bg-purple-500', activeColor: 'bg-gradient-to-r from-purple-500 to-purple-600' },
];

export function CategoryFilter({ value, onChange, stats }: CategoryFilterProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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
    if (!stats) return undefined;
    switch (key) {
      case 'all': return stats.total;
      case 'new': return stats.byCategory.new;
      case 'pain': return stats.byCategory.pain;
      case 'reach': return stats.byCategory.reach;
      case 'kol': return stats.byCategory.kol;
    }
  };

  const selectedLabel = useMemo(() => {
    if (value.includes('all') || value.length === 0) return '全部';
    return categories
      .filter(cat => cat.key !== 'all' && value.includes(cat.key))
      .map(cat => cat.label)
      .join(' / ') || '全部';
  }, [value]);

  return (
    <div ref={containerRef} className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="inline-flex items-center gap-2 px-4 h-9 rounded-full text-sm font-medium bg-stone-100 text-stone-600 hover:bg-stone-200 border border-stone-200/50 whitespace-nowrap"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="text-stone-500">分类</span>
        <span className="text-stone-700 max-w-[160px] truncate">{selectedLabel}</span>
        <svg className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
            className="fixed left-4 right-4 top-1/3 z-50 w-auto max-w-[280px] mx-auto rounded-2xl bg-white border border-stone-200 shadow-xl p-2 sm:absolute sm:left-0 sm:right-auto sm:top-full sm:mt-2 sm:w-60 sm:max-w-none sm:mx-0 sm:shadow-lg sm:shadow-stone-200/50"
          >
            <div className="text-xs text-stone-400 px-3 py-1.5 sm:hidden">选择分类</div>
            {categories.map(cat => {
              const isActive = value.includes(cat.key);
              const count = getCount(cat.key);

              return (
                <button
                  key={cat.key}
                  onClick={() => handleClick(cat.key)}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 sm:py-2 rounded-xl text-sm font-medium transition-all ${
                    isActive
                      ? `${cat.activeColor} text-white shadow-sm`
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
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                      isActive ? 'bg-white/20' : 'bg-stone-200/80'
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
