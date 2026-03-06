'use client';

import { TweetGroup } from '@/lib/types';

interface GroupBadgeProps {
  group: TweetGroup | string | null;
}

const GROUP_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  sentiment: { label: '品牌提及', icon: '⭐', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  pain: { label: '痛点', icon: '🔥', color: 'bg-rose-100 text-rose-700 border-rose-200' },
  insight: { label: '洞察', icon: '💡', color: 'bg-purple-100 text-purple-700 border-purple-200' },
  reach: { label: '传播', icon: '📢', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
};

export function GroupBadge({ group }: GroupBadgeProps) {
  const config = GROUP_CONFIG[group ?? ''] ?? {
    label: group ?? '未知',
    icon: '📋',
    color: 'bg-stone-100 text-stone-600 border-stone-200',
  };

  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${config.color}`}
    >
      <span>{config.icon}</span>
      <span>{config.label}</span>
    </span>
  );
}
