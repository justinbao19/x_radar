'use client';

import { useState, useEffect } from 'react';
import { SKIP_REASON_CONFIG } from '@/lib/skipReasons';
import { useTelegram } from '@/lib/TelegramContext';
import { closeMiniApp } from '@/lib/telegram';
import { SummaryResponse, SkipReason } from '@/lib/types';

const DEFAULT_USER_ID = '5134454816';

export default function ReviewDonePage() {
  const { userId: tgUserId } = useTelegram();
  const userId = tgUserId || DEFAULT_USER_ID;
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSummary() {
      try {
        const today = new Date().toISOString().split('T')[0];
        const res = await fetch(`/api/summary?date=${today}`);
        if (res.ok) {
          setSummary(await res.json());
        }
      } catch (err) {
        console.error('Failed to fetch summary:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchSummary();
  }, [userId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-stone-300 border-t-stone-600" />
      </div>
    );
  }

  const stats = summary?.stats;

  return (
    <div className="min-h-screen bg-linear-to-br from-stone-100 via-stone-50 to-amber-50/30 flex items-center justify-center p-6">
      <div className="max-w-md w-full space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="text-5xl">✅</div>
          <h1 className="text-xl font-bold text-stone-800">全部处理完毕！</h1>
        </div>

        {/* Stats card */}
        <div className="bg-white rounded-2xl border border-stone-200 p-5 space-y-4">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-stone-800">{stats?.total ?? 0}</div>
              <div className="text-xs text-stone-500">总推文</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-emerald-600">{stats?.confirmed ?? 0}</div>
              <div className="text-xs text-stone-500">确认回复</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-stone-400">{stats?.skipped ?? 0}</div>
              <div className="text-xs text-stone-500">跳过</div>
            </div>
          </div>

          {/* Skip reasons breakdown */}
          {stats?.skipReasons && Object.keys(stats.skipReasons).length > 0 && (
            <div className="pt-3 border-t border-stone-100 space-y-2">
              <p className="text-xs font-medium text-stone-500 uppercase tracking-wider">跳过原因分布</p>
              {Object.entries(stats.skipReasons)
                .sort(([, a], [, b]) => b - a)
                .map(([reason, count]) => {
                  const config = SKIP_REASON_CONFIG[reason as SkipReason];
                  return (
                    <div key={reason} className="flex items-center justify-between text-sm">
                      <span className="text-stone-600">
                        {config?.icon ?? '📋'} {config?.label ?? reason}
                      </span>
                      <span className="font-medium text-stone-700">{count}</span>
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        {/* Status message */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
          <p className="text-sm text-amber-700">
            回复建议正在生成中...
          </p>
          <p className="text-xs text-amber-500 mt-1">
            将通过 Telegram 推送给你 📩
          </p>
        </div>

        {/* Close button */}
        <button
          onClick={closeMiniApp}
          className="w-full py-3 bg-stone-800 text-white rounded-xl font-medium text-sm hover:bg-stone-900 transition-colors active:scale-[0.98]"
        >
          关闭
        </button>
      </div>
    </div>
  );
}
