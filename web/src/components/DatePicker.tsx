'use client';

import { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronDown, Info } from 'lucide-react';
import { RunCountPreset, RUNS_PER_DAY } from '@/lib/types';

interface DatePickerProps {
  value: RunCountPreset;
  onChange: (preset: RunCountPreset) => void;
}

const presets: { key: RunCountPreset; label: string }[] = [
  { key: 'today', label: '今天' },
  { key: '3days', label: '近 3 天' },
  { key: '7days', label: '近 7 天' },
];

export function DatePicker({ value, onChange }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const handlePresetClick = (key: RunCountPreset) => {
    onChange(key);
    setOpen(false);
  };

  // Get display label for button
  const activePreset = presets.find(p => p.key === value);
  const displayLabel = activePreset?.label || '近 7 天';

  return (
    <div ref={containerRef} className="relative inline-flex items-center shrink-0 gap-1">
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-sm font-medium bg-stone-100 text-stone-600 hover:bg-stone-200 transition-colors whitespace-nowrap"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Calendar className="w-4 h-4 text-stone-500" />
        <span className="text-stone-700">{displayLabel}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-stone-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Info Icon with Tooltip */}
      <div className="relative">
        <button
          type="button"
          className="w-5 h-5 rounded-full text-stone-400 hover:text-stone-600 hover:bg-stone-100 flex items-center justify-center transition-colors"
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
          onClick={() => setShowTooltip(!showTooltip)}
        >
          <Info className="w-4 h-4" />
        </button>
        
        {/* Tooltip - z-[100] ensures it's above dropdown (z-50) */}
        {showTooltip && (
          <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-[100] w-48 p-2.5 bg-stone-800 text-white text-xs rounded-lg shadow-xl">
            <div className="font-medium mb-1.5">按爬取次数筛选</div>
            <div className="space-y-1 text-stone-300">
              <div>今天 = 最近 {RUNS_PER_DAY} 次</div>
              <div>近 3 天 = 最近 {RUNS_PER_DAY * 3} 次</div>
              <div>近 7 天 = 最近 {RUNS_PER_DAY * 7} 次</div>
            </div>
            <div className="mt-2 pt-2 border-t border-stone-700 text-stone-400">
              每天爬取 {RUNS_PER_DAY} 次
            </div>
            {/* Arrow */}
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-stone-800 rotate-45" />
          </div>
        )}
      </div>

      {/* Dropdown Panel */}
      {open && (
        <>
          {/* Mobile backdrop */}
          <div 
            className="fixed inset-0 bg-black/20 z-40 sm:hidden" 
            onClick={() => setOpen(false)}
          />
          <div className="fixed left-4 right-4 top-1/3 z-50 w-auto max-w-[200px] mx-auto sm:absolute sm:left-0 sm:right-auto sm:top-full sm:mt-2 sm:w-auto sm:max-w-none sm:mx-0">
            <div className="bg-white rounded-xl border border-stone-200 shadow-lg overflow-hidden animate-fade-in">
              <div className="p-1.5">
                <div className="text-xs text-stone-400 px-2 py-1 sm:hidden">选择时间范围</div>
                {presets.map(preset => (
                  <button
                    key={preset.key}
                    onClick={() => handlePresetClick(preset.key)}
                    className={`w-full flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      value === preset.key
                        ? 'bg-stone-800 text-white'
                        : 'text-stone-600 hover:bg-stone-100'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
