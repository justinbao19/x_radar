'use client';

import { useState, useRef, useEffect } from 'react';
import { SortOption } from '@/lib/types';

interface SortSelectorProps {
  value: SortOption;
  onChange: (value: SortOption) => void;
}

const sortOptions: { value: SortOption; label: string; icon: React.ReactNode }[] = [
  {
    value: 'score',
    label: '推荐排序',
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2L9.19 8.63L2 9.24L7.46 13.97L5.82 21L12 17.27L18.18 21L16.54 13.97L22 9.24L14.81 8.63L12 2Z"/>
      </svg>
    )
  },
  {
    value: 'date',
    label: '时间排序',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )
  },
  {
    value: 'engagement',
    label: '热度排序',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z" />
      </svg>
    )
  }
];

export function SortSelector({ value, onChange }: SortSelectorProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentOption = sortOptions.find(opt => opt.value === value) || sortOptions[0];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative w-full sm:w-auto">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-2 px-4 py-2 bg-white border border-stone-200 rounded-full hover:border-stone-300 hover:bg-stone-50 transition-all text-sm font-medium text-stone-700 shadow-sm sm:w-auto"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="text-amber-600">{currentOption.icon}</span>
        <span className="hidden sm:inline">{currentOption.label}</span>
        <svg 
          className={`w-4 h-4 text-stone-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-40 bg-white border border-stone-200 rounded-2xl shadow-lg shadow-stone-200/50 py-1 z-50 animate-fade-in">
          {sortOptions.map(option => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                value === option.value
                  ? 'bg-amber-50 text-amber-700'
                  : 'text-stone-600 hover:bg-stone-50'
              }`}
            >
              <span className={value === option.value ? 'text-amber-600' : 'text-stone-400'}>
                {option.icon}
              </span>
              {option.label}
              {value === option.value && (
                <svg className="w-4 h-4 ml-auto text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
