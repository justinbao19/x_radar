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
    <div ref={containerRef} className="relative flex w-full items-center sm:inline-flex sm:w-auto">
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="inline-flex w-full items-center justify-between gap-2 px-4 h-9 rounded-full text-sm font-medium bg-stone-100 text-stone-600 hover:bg-stone-200 border border-stone-200/50 whitespace-nowrap sm:w-auto"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="hidden sm:inline text-stone-500">分类</span>
        <span className="text-stone-700 max-w-[160px] truncate">{selectedLabel}</span>
        <svg className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute left-0 sm:left-auto sm:right-0 top-full mt-2 w-60 rounded-2xl bg-white border border-stone-200 shadow-lg shadow-stone-200/50 p-2 z-30"
        >
          {categories.map(cat => {
            const isActive = value.includes(cat.key);
            const count = getCount(cat.key);

            return (
              <button
                key={cat.key}
                onClick={() => handleClick(cat.key)}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
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
      )}
    </div>
  );
}
