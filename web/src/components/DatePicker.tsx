'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { DateRange } from '@/lib/types';

interface DatePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  availableDates?: string[];
}

type PresetKey = 'today' | '3days' | '7days' | 'custom';

const presets: { key: PresetKey; label: string }[] = [
  { key: 'today', label: '今天' },
  { key: '3days', label: '近 3 天' },
  { key: '7days', label: '近 7 天' },
];

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

function getPresetRange(key: PresetKey): DateRange {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  switch (key) {
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

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateDisplay(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function isSameDate(d1: Date, d2: Date): boolean {
  return d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();
}

function isDateInRange(date: Date, start: Date | null, end: Date | null): boolean {
  if (!start) return false;
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const s = new Date(start);
  s.setHours(0, 0, 0, 0);
  if (!end) return isSameDate(d, s);
  const e = new Date(end);
  e.setHours(0, 0, 0, 0);
  return d >= s && d <= e;
}

function getCalendarDays(year: number, month: number): (Date | null)[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startWeekday = firstDay.getDay();
  
  const days: (Date | null)[] = [];
  
  // Add empty slots for days before the first day of the month
  for (let i = 0; i < startWeekday; i++) {
    days.push(null);
  }
  
  // Add all days of the month
  for (let day = 1; day <= daysInMonth; day++) {
    days.push(new Date(year, month, day));
  }
  
  return days;
}

export function DatePicker({ value, onChange, availableDates }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [rangeStart, setRangeStart] = useState<string | null>(null);
  const [hoverDate, setHoverDate] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const activePreset = getActivePreset(value);

  // Parse available dates into a Set for quick lookup
  const availableDateSet = useMemo(() => new Set(availableDates || []), [availableDates]);

  // Get the month range from available dates
  const { initialYear, initialMonth, minDate, maxDate } = useMemo(() => {
    if (!availableDates || availableDates.length === 0) {
      const now = new Date();
      return { 
        initialYear: now.getFullYear(), 
        initialMonth: now.getMonth(),
        minDate: null,
        maxDate: null
      };
    }
    const sorted = [...availableDates].sort();
    const latest = new Date(sorted[sorted.length - 1] + 'T00:00:00');
    return {
      initialYear: latest.getFullYear(),
      initialMonth: latest.getMonth(),
      minDate: new Date(sorted[0] + 'T00:00:00'),
      maxDate: latest
    };
  }, [availableDates]);

  const [viewYear, setViewYear] = useState(initialYear);
  const [viewMonth, setViewMonth] = useState(initialMonth);

  // Reset view when opening calendar
  useEffect(() => {
    if (showCalendar) {
      setViewYear(initialYear);
      setViewMonth(initialMonth);
    }
  }, [showCalendar, initialYear, initialMonth]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
        setShowCalendar(false);
        setRangeStart(null);
        setHoverDate(null);
      }
    };
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const calendarDays = useMemo(() => getCalendarDays(viewYear, viewMonth), [viewYear, viewMonth]);

  const canGoPrev = minDate ? new Date(viewYear, viewMonth, 1) > new Date(minDate.getFullYear(), minDate.getMonth(), 1) : true;
  const canGoNext = maxDate ? new Date(viewYear, viewMonth, 1) < new Date(maxDate.getFullYear(), maxDate.getMonth(), 1) : true;

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewYear(viewYear - 1);
      setViewMonth(11);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewYear(viewYear + 1);
      setViewMonth(0);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const handlePresetClick = (key: PresetKey) => {
    onChange(getPresetRange(key));
    setOpen(false);
    setShowCalendar(false);
    setRangeStart(null);
    setHoverDate(null);
  };

  const handleDateClick = (date: Date) => {
    const dateStr = toDateStr(date);
    if (!availableDateSet.has(dateStr)) return;

    if (!rangeStart) {
      setRangeStart(dateStr);
    } else {
      const startDate = new Date(rangeStart + 'T00:00:00');
      const endDate = date;
      
      const [finalStart, finalEnd] = startDate <= endDate 
        ? [startDate, endDate] 
        : [endDate, startDate];
      
      onChange({
        start: finalStart,
        end: new Date(finalEnd.getTime() + 24 * 60 * 60 * 1000 - 1)
      });
      setOpen(false);
      setShowCalendar(false);
      setRangeStart(null);
      setHoverDate(null);
    }
  };

  const getDateState = (date: Date): 'start' | 'end' | 'in-range' | 'hover-range' | 'none' => {
    if (rangeStart) {
      const start = new Date(rangeStart + 'T00:00:00');
      if (isSameDate(date, start)) return 'start';
      
      if (hoverDate) {
        const hover = new Date(hoverDate + 'T00:00:00');
        const [s, e] = start <= hover ? [start, hover] : [hover, start];
        if (isDateInRange(date, s, e)) return 'hover-range';
      }
    }
    
    return 'none';
  };

  // Get display label for button
  const displayLabel = useMemo(() => {
    if (activePreset) {
      const preset = presets.find(p => p.key === activePreset);
      return preset?.label || '近 7 天';
    }
    // Custom range
    const start = new Date(value.start);
    const end = new Date(value.end);
    return `${formatDateDisplay(start)} - ${formatDateDisplay(end)}`;
  }, [activePreset, value]);

  return (
    <div ref={containerRef} className="relative inline-flex items-center shrink-0">
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-sm font-medium bg-stone-100 text-stone-600 hover:bg-stone-200 transition-colors whitespace-nowrap"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <svg className="w-4 h-4 text-stone-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span className="text-stone-700">{displayLabel}</span>
        <svg className={`w-3.5 h-3.5 text-stone-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown Panel */}
      {open && (
        <>
          {/* Mobile backdrop */}
          <div 
            className="fixed inset-0 bg-black/20 z-40 sm:hidden" 
            onClick={() => {
              setOpen(false);
              setShowCalendar(false);
              setRangeStart(null);
              setHoverDate(null);
            }}
          />
          <div className="fixed left-4 right-4 top-1/3 z-50 w-auto max-w-[300px] mx-auto sm:absolute sm:left-0 sm:right-auto sm:top-full sm:mt-2 sm:w-auto sm:max-w-none sm:mx-0">
            <div className="bg-white rounded-xl border border-stone-200 shadow-lg overflow-hidden animate-fade-in">
              {!showCalendar ? (
                /* Preset Options */
                <div className="p-1.5">
                  <div className="text-xs text-stone-400 px-2 py-1 sm:hidden">选择时间范围</div>
                  {presets.map(preset => (
                    <button
                      key={preset.key}
                      onClick={() => handlePresetClick(preset.key)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        activePreset === preset.key
                          ? 'bg-stone-800 text-white'
                          : 'text-stone-600 hover:bg-stone-100'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                  {availableDates && availableDates.length > 0 && (
                    <>
                      <div className="h-px bg-stone-100 my-1" />
                      <button
                        onClick={() => setShowCalendar(true)}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                          !activePreset
                            ? 'bg-stone-800 text-white'
                            : 'text-stone-600 hover:bg-stone-100'
                        }`}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        自定义
                      </button>
                    </>
                  )}
                </div>
              ) : (
                /* Calendar View */
                <div className="w-[280px]">
                  {/* Back button */}
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-stone-100">
                    <button
                      onClick={() => {
                        setShowCalendar(false);
                        setRangeStart(null);
                        setHoverDate(null);
                      }}
                      className="p-1 rounded-lg hover:bg-stone-100 text-stone-500"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <span className="text-sm font-medium text-stone-700">选择日期范围</span>
                  </div>

                  {/* Calendar Header */}
                  <div className="flex items-center justify-between px-3 py-2 bg-stone-50">
                    <button
                      onClick={handlePrevMonth}
                      disabled={!canGoPrev}
                      className={`p-1 rounded-lg transition-colors ${
                        canGoPrev 
                          ? 'hover:bg-stone-200 text-stone-600' 
                          : 'text-stone-300 cursor-not-allowed'
                      }`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <div className="text-sm font-semibold text-stone-800">
                      {viewYear}年 {MONTHS[viewMonth]}
                    </div>
                    <button
                      onClick={handleNextMonth}
                      disabled={!canGoNext}
                      className={`p-1 rounded-lg transition-colors ${
                        canGoNext 
                          ? 'hover:bg-stone-200 text-stone-600' 
                          : 'text-stone-300 cursor-not-allowed'
                      }`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>

                  {/* Weekday Headers */}
                  <div className="grid grid-cols-7 px-2 pt-2">
                    {WEEKDAYS.map(day => (
                      <div key={day} className="text-center text-xs font-medium text-stone-400 py-1.5">
                        {day}
                      </div>
                    ))}
                  </div>

                  {/* Calendar Grid */}
                  <div className="grid grid-cols-7 px-2 pb-2 gap-y-0.5">
                    {calendarDays.map((date, index) => {
                      if (!date) {
                        return <div key={`empty-${index}`} className="h-8" />;
                      }
                      
                      const dateStr = toDateStr(date);
                      const isAvailable = availableDateSet.has(dateStr);
                      const state = getDateState(date);
                      const isToday = isSameDate(date, new Date());
                      
                      return (
                        <button
                          key={dateStr}
                          onClick={() => handleDateClick(date)}
                          onMouseEnter={() => rangeStart && isAvailable && setHoverDate(dateStr)}
                          onMouseLeave={() => setHoverDate(null)}
                          disabled={!isAvailable}
                          className={`h-8 w-full rounded-lg text-sm font-medium transition-colors relative ${
                            !isAvailable
                              ? 'text-stone-300 cursor-not-allowed'
                              : state === 'start'
                                ? 'bg-stone-800 text-white'
                                : state === 'hover-range'
                                  ? 'bg-stone-200 text-stone-800'
                                  : isToday
                                    ? 'bg-stone-100 text-stone-800 hover:bg-stone-200'
                                    : 'text-stone-700 hover:bg-stone-100'
                          }`}
                        >
                          {date.getDate()}
                          {isToday && !state && (
                            <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-stone-800" />
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Selection Status */}
                  <div className="px-3 py-2.5 bg-stone-50 border-t border-stone-100">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-stone-500">
                        {!rangeStart ? '点击选择开始日期' : '点击选择结束日期'}
                      </span>
                      {rangeStart && (
                        <button
                          onClick={() => {
                            setRangeStart(null);
                            setHoverDate(null);
                          }}
                          className="text-stone-600 hover:text-stone-800 font-medium"
                        >
                          重置
                        </button>
                      )}
                    </div>
                    {rangeStart && (
                      <div className="mt-1.5 flex items-center gap-2 text-sm">
                        <span className="px-2 py-0.5 bg-stone-800 text-white rounded text-xs font-medium">
                          {new Date(rangeStart + 'T00:00:00').getMonth() + 1}/{new Date(rangeStart + 'T00:00:00').getDate()}
                        </span>
                        <span className="text-stone-400">→</span>
                        <span className="px-2 py-0.5 bg-stone-200 text-stone-500 rounded text-xs">
                          {hoverDate 
                            ? `${new Date(hoverDate + 'T00:00:00').getMonth() + 1}/${new Date(hoverDate + 'T00:00:00').getDate()}`
                            : '?'
                          }
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
