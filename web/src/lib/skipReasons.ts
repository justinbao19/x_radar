import { SkipReason } from './types';

export const SKIP_REASON_OPTIONS: { value: SkipReason; label: string; icon: string }[] = [
  { value: 'is_ad', label: '是广告/推广', icon: '🎯' },
  { value: 'customer_service', label: '售后/客服问题', icon: '🛒' },
  { value: 'too_old', label: '时效过了', icon: '⏰' },
  { value: 'no_angle', label: '不好切入', icon: '🤷' },
  { value: 'not_relevant', label: '不相关', icon: '❌' },
  { value: 'other', label: '其他', icon: '💬' },
];

export const SKIP_REASON_LABELS: Record<SkipReason, string> = Object.fromEntries(
  SKIP_REASON_OPTIONS.map(({ value, label }) => [value, label])
) as Record<SkipReason, string>;

export const SKIP_REASON_CONFIG: Record<SkipReason, { label: string; icon: string }> = Object.fromEntries(
  SKIP_REASON_OPTIONS.map(({ value, label, icon }) => [value, { label, icon }])
) as Record<SkipReason, { label: string; icon: string }>;

export function formatSkipReasonFeedback(reason: SkipReason, note?: string): string {
  const trimmedNote = note?.trim();
  if (reason === 'other') {
    return trimmedNote ? `${reason}: ${trimmedNote}` : reason;
  }
  return reason;
}
