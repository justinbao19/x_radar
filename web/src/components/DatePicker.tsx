'use client';

import { useState } from 'react';
import { DateRange } from '@/lib/types';
import { formatDate } from '@/lib/data';

interface DatePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  availableDates?: string[];
}

type PresetKey = 'today' | 'yesterday' | '3days' | '7days';

const presets: { key: PresetKey; label: string }[] = [
  { key: 'today', label: '今天' },
  { key: 'yesterday', label: '昨天' },
  { key: '3days', label: '近 3 天' },
  { key: '7days', label: '近 7 天' },
];

function getPresetRange(key: PresetKey): DateRange {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  switch (key) {
    case 'yesterday':
      start.setDate(start.getDate() - 1);
      end.setDate(end.getDate() - 1);
      break;
    case '3days':
      start.setDate(start.getDate() - 2);
      break;
    case '7days':
      start.setDate(start.getDate() - 6);
      break;
  }

  return { start, end };
}

function getActivePreset(range: DateRange): PresetKey | null {
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const rangeStart = new Date(range.start);
  rangeStart.setHours(0, 0, 0, 0);
  const rangeEnd = new Date(range.end);
  rangeEnd.setHours(0, 0, 0, 0);

  for (const preset of presets) {
    const presetRange = getPresetRange(preset.key);
    const presetStart = new Date(presetRange.start);
    presetStart.setHours(0, 0, 0, 0);
    const presetEnd = new Date(presetRange.end);
    presetEnd.setHours(0, 0, 0, 0);

    if (rangeStart.getTime() === presetStart.getTime() && 
        rangeEnd.getTime() === presetEnd.getTime()) {
      return preset.key;
    }
  }
  return null;
}

export function DatePicker({ value, onChange, availableDates }: DatePickerProps) {
  const [showCustom, setShowCustom] = useState(false);
  const activePreset = getActivePreset(value);

  const handlePresetClick = (key: PresetKey) => {
    onChange(getPresetRange(key));
    setShowCustom(false);
  };

  const handleDateSelect = (date: string) => {
    const d = new Date(date + 'T00:00:00');
    onChange({
      start: d,
      end: new Date(d.getTime() + 24 * 60 * 60 * 1000 - 1)
    });
    setShowCustom(false);
  };

  return (
    <div className="relative w-full max-w-full flex flex-col items-start sm:w-auto sm:inline-flex sm:flex-row sm:items-center sm:pb-6 lg:pb-0">
      <div className="flex flex-wrap items-center gap-2 w-full max-w-full sm:flex-nowrap sm:overflow-x-auto">
        {presets.map(preset => (
          <button
            key={preset.key}
            onClick={() => handlePresetClick(preset.key)}
            className={`inline-flex items-center px-4 h-9 rounded-full text-sm font-medium whitespace-nowrap shrink-0 transition-all duration-200 ${
              activePreset === preset.key
                ? 'bg-gradient-to-r from-stone-800 to-stone-900 text-white shadow-md shadow-stone-900/20'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200 border border-stone-200/50'
            }`}
          >
            {preset.label}
          </button>
        ))}
        <button
          onClick={() => setShowCustom(!showCustom)}
          className={`inline-flex items-center gap-2 px-4 h-9 rounded-full text-sm font-medium whitespace-nowrap shrink-0 transition-all duration-200 ${
            showCustom || (!activePreset && availableDates)
              ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md shadow-amber-500/25'
              : 'bg-stone-100 text-stone-600 hover:bg-stone-200 border border-stone-200/50'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          选择日期
        </button>
      </div>

      {showCustom && availableDates && availableDates.length > 0 && (
        <>
          <div className="fixed inset-0 bg-black/20 z-30 sm:hidden" />
          <div className="fixed inset-x-0 top-20 z-40 px-4 sm:px-0 sm:static sm:top-auto sm:inset-auto sm:z-auto">
            <div className="w-[360px] max-w-[90vw] sm:w-[360px] sm:max-w-[90vw] mx-auto sm:mx-0 p-4 bg-white rounded-2xl border border-stone-200 shadow-lg shadow-stone-200/50 animate-fade-in sm:absolute sm:left-0 sm:top-full sm:mt-3">
              <div className="text-xs text-stone-500 mb-2">选择日期</div>
              <div className="flex flex-wrap gap-2">
                {availableDates.map(date => (
                  <button
                    key={date}
                    onClick={() => handleDateSelect(date)}
                    className="px-3 py-1.5 rounded-xl text-sm bg-stone-50 border border-stone-200 hover:border-amber-400 hover:bg-amber-50 hover:text-amber-700 transition-all"
                  >
                    {formatDate(date)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {!showCustom && (
        <div className="mt-2 text-sm text-stone-500 flex items-center gap-2 sm:absolute sm:left-0 sm:top-full sm:mt-2">
          <svg className="w-4 h-4 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {formatDate(value.start)} — {formatDate(value.end)}
        </div>
      )}
    </div>
  );
}
