import { useEffect, useMemo, useRef, useState } from 'react';
import { LanguageFilter as LanguageFilterType } from '@/lib/types';
import { BottomSheet } from './BottomSheet';

interface LanguageFilterProps {
  value: LanguageFilterType;
  onChange: (language: LanguageFilterType) => void;
  stats: Record<string, number>;
}

export function LanguageFilter({ value, onChange, stats }: LanguageFilterProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const languages = useMemo(() => {
    const flagMap: Record<string, string> = {
      en: '🇺🇸', ja: '🇯🇵', zh: '🇨🇳', ko: '🇰🇷', fr: '🇫🇷',
      de: '🇩🇪', es: '🇪🇸', pt: '🇵🇹', ru: '🇷🇺', other: '🧩', unknown: '❔',
    };
    const nameMap: Record<string, string> = {
      en: '英语', ja: '日语', zh: '中文', ko: '韩语', fr: '法语',
      de: '德语', es: '西班牙语', pt: '葡萄牙语', ru: '俄语', other: '其他', unknown: '未知',
    };
    return Object.entries(stats)
      .map(([lang, count]) => ({
        key: lang.toLowerCase(),
        code: lang.toUpperCase(),
        count,
        flag: flagMap[lang.toLowerCase()] || '🌐',
        label: nameMap[lang.toLowerCase()] || '未知',
      }))
      .filter(item => item.count > 0)
      .sort((a, b) => {
        const tailKeys = new Set(['other', 'unknown']);
        const aIsTail = tailKeys.has(a.key);
        const bIsTail = tailKeys.has(b.key);
        if (aIsTail !== bIsTail) return aIsTail ? 1 : -1;
        return b.count - a.count;
      });
  }, [stats]);

  const languageCount = languages.length;
  const totalCount = languages.reduce((sum, item) => sum + item.count, 0);
  const activeLanguage = value && value !== 'all' ? value.toLowerCase() : null;
  const activeFlag = activeLanguage
    ? languages.find(item => item.key === activeLanguage)?.flag || '🌐'
    : null;
  const activeLabel = activeLanguage
    ? languages.find(item => item.key === activeLanguage)?.label || '未知'
    : null;
  const selectedLabel = activeLanguage ? activeLabel : '全部';

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

  if (languageCount === 0) {
    return null;
  }

  const handleSelect = (lang: LanguageFilterType) => {
    onChange(lang);
    setOpen(false);
  };

  const optionsList = (
    <div className="space-y-1 max-h-52 sm:max-h-52 overflow-auto">
      <button
        type="button"
        onClick={() => handleSelect('all')}
        className={`w-full flex items-center justify-between px-3 py-2.5 sm:px-2 sm:py-1.5 rounded-xl sm:rounded-lg text-sm transition-colors ${
          value === 'all'
            ? 'bg-stone-800 text-white'
            : 'text-stone-600 hover:bg-stone-100'
        }`}
        role="option"
        aria-selected={value === 'all'}
      >
        <span className="flex items-center gap-2">
          <span className="text-sm">🌐</span>
          全部
        </span>
        <span className={value === 'all' ? 'text-stone-300' : 'text-stone-400'}>{totalCount}</span>
      </button>
      {languages.map(item => (
        <button
          key={item.code}
          type="button"
          onClick={() => handleSelect(item.key)}
          className={`w-full flex items-center justify-between px-3 py-2.5 sm:px-2 sm:py-1.5 rounded-xl sm:rounded-lg text-sm transition-colors ${
            activeLanguage === item.key
              ? 'bg-stone-800 text-white'
              : 'text-stone-600 hover:bg-stone-100'
          }`}
          role="option"
          aria-selected={activeLanguage === item.key}
        >
          <span className="flex items-center gap-2">
            <span className="text-sm">{item.flag}</span>
            {item.label}
          </span>
          <span className={activeLanguage === item.key ? 'text-stone-300' : 'text-stone-400'}>{item.count}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div ref={containerRef} className="relative inline-flex items-center shrink-0">
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-sm font-medium bg-stone-100 text-stone-600 hover:bg-stone-200 transition-colors whitespace-nowrap"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="text-stone-500">语言</span>
        {activeFlag && <span className="text-sm">{activeFlag}</span>}
        <span className="text-stone-700 max-w-[100px] truncate">{selectedLabel}</span>
        <svg className={`w-3.5 h-3.5 text-stone-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Desktop dropdown */}
      {open && (
        <div
          role="listbox"
          className="hidden sm:block absolute left-0 top-full mt-2 z-50 w-52 rounded-xl bg-white border border-stone-200 shadow-lg p-1.5 animate-fade-in"
        >
          {optionsList}
        </div>
      )}

      {/* Mobile bottom sheet */}
      <BottomSheet open={open} onClose={() => setOpen(false)} title="语言筛选">
        {optionsList}
      </BottomSheet>
    </div>
  );
}
