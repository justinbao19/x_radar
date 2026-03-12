const LANGUAGE_ALIASES: Record<string, string> = {
  english: 'en',
  en: 'en',
  'en-us': 'en',
  'en-gb': 'en',
  japanese: 'ja',
  ja: 'ja',
  'ja-jp': 'ja',
  chinese: 'zh',
  zh: 'zh',
  'zh-cn': 'zh',
  'zh-tw': 'zh',
  'zh-hans': 'zh',
  'zh-hant': 'zh',
  korean: 'ko',
  ko: 'ko',
  'ko-kr': 'ko',
  spanish: 'es',
  es: 'es',
  french: 'fr',
  fr: 'fr',
  german: 'de',
  de: 'de',
  portuguese: 'pt',
  pt: 'pt',
  russian: 'ru',
  ru: 'ru',
  arabic: 'ar',
  ar: 'ar',
  hindi: 'hi',
  hi: 'hi',
  other: 'other',
  unknown: 'other',
  und: 'other',
};

export function normalizeLanguageTag(language?: string | null): string {
  if (!language) return 'other';

  const normalized = language.trim().toLowerCase().replace(/_/g, '-');
  if (!normalized) return 'other';

  return LANGUAGE_ALIASES[normalized] || normalized.split('-')[0] || 'other';
}

export function detectLanguageFromText(text?: string | null): string {
  if (!text) return 'other';

  if (/[\u3040-\u30ff]/.test(text)) return 'ja';
  if (/[\uac00-\ud7af]/.test(text)) return 'ko';
  if (/[\u4e00-\u9fff]/.test(text)) return 'zh';
  if (/[\u0400-\u04ff]/.test(text)) return 'ru';
  if (/[\u0600-\u06ff]/.test(text)) return 'ar';
  if (/[\u0900-\u097f]/.test(text)) return 'hi';
  if (/[A-Za-z]/.test(text)) return 'en';

  return 'other';
}

export function getPreferredReplyLanguage(language?: string | null, text?: string | null): string {
  const normalized = normalizeLanguageTag(language);
  if (normalized !== 'other') return normalized;

  return detectLanguageFromText(text);
}

export function isChineseLanguage(language?: string | null): boolean {
  return normalizeLanguageTag(language) === 'zh';
}

export function shouldShowChineseTranslation(language?: string | null, translationZh?: string | null): boolean {
  return Boolean(translationZh && !isChineseLanguage(language));
}
