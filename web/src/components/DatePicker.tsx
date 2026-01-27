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
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        {presets.map(preset => (
          <button
            key={preset.key}
            onClick={() => handlePresetClick(preset.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activePreset === preset.key
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {preset.label}
          </button>
        ))}
        <button
          onClick={() => setShowCustom(!showCustom)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            showCustom || (!activePreset && availableDates)
              ? 'bg-violet-600 text-white'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          选择日期
        </button>
      </div>

      {showCustom && availableDates && availableDates.length > 0 && (
        <div className="flex flex-wrap gap-2 p-4 bg-slate-50 rounded-xl border border-slate-200">
          {availableDates.map(date => (
            <button
              key={date}
              onClick={() => handleDateSelect(date)}
              className="px-3 py-1.5 rounded-lg text-sm bg-white border border-slate-200 hover:border-violet-400 hover:bg-violet-50 transition-all"
            >
              {formatDate(date)}
            </button>
          ))}
        </div>
      )}

      <div className="text-sm text-slate-500">
        {formatDate(value.start)} — {formatDate(value.end)}
      </div>
    </div>
  );
}
