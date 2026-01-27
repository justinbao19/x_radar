'use client';

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

  const getCount = (key: CategoryFilterType): number | undefined => {
    if (!stats) return undefined;
    switch (key) {
      case 'all': return stats.total;
      case 'pain': return stats.byCategory.pain;
      case 'reach': return stats.byCategory.reach;
      case 'kol': return stats.byCategory.kol;
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-stone-500 mr-1 hidden sm:inline">分类:</span>
      {categories.map(cat => {
        const isActive = value.includes(cat.key);
        const count = getCount(cat.key);
        
        return (
          <button
            key={cat.key}
            onClick={() => handleClick(cat.key)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-all duration-200 ${
              isActive
                ? `${cat.activeColor} text-white shadow-md`
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200 border border-stone-200/50'
            }`}
          >
            {cat.label}
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
  );
}
