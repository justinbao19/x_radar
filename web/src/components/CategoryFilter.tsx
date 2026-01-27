'use client';

import { CategoryFilter as CategoryFilterType } from '@/lib/types';
import { TweetStats } from '@/lib/data';

interface CategoryFilterProps {
  value: CategoryFilterType[];
  onChange: (categories: CategoryFilterType[]) => void;
  stats?: TweetStats;
}

const categories: { key: CategoryFilterType; label: string; color: string }[] = [
  { key: 'all', label: '全部', color: 'bg-slate-500' },
  { key: 'pain', label: '痛点', color: 'bg-pink-500' },
  { key: 'reach', label: '传播', color: 'bg-blue-500' },
  { key: 'kol', label: 'KOL', color: 'bg-violet-500' },
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
    <div className="flex items-center gap-2">
      <span className="text-sm text-slate-500 mr-1">分类:</span>
      {categories.map(cat => {
        const isActive = value.includes(cat.key);
        const count = getCount(cat.key);
        
        return (
          <button
            key={cat.key}
            onClick={() => handleClick(cat.key)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              isActive
                ? `${cat.color} text-white`
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {cat.label}
            {count !== undefined && (
              <span className={`text-xs ${isActive ? 'opacity-80' : 'opacity-60'}`}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
