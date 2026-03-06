'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { SwipeCard } from '@/components/SwipeCard';
import { SkipReasonSheet } from '@/components/SkipReasonSheet';
import { useTelegram } from '@/lib/TelegramContext';
import { SwipeTweet, SkipReason, CardsResponse, DecisionRequest } from '@/lib/types';
import { hapticFeedback } from '@/lib/telegram';

const DEFAULT_USER_ID = '5134454816';

type RadarTab = 'all' | 'pain_radar' | 'filo_sentiment' | 'user_insight';

const RADAR_TABS: { id: RadarTab; label: string; icon: string; shortLabel: string }[] = [
  { id: 'all', label: '全部', icon: '📋', shortLabel: '全部' },
  { id: 'pain_radar', label: '痛点雷达', icon: '🔥', shortLabel: '痛点' },
  { id: 'filo_sentiment', label: 'Filo舆情', icon: '⭐', shortLabel: '舆情' },
  { id: 'user_insight', label: '用户洞察', icon: '💡', shortLabel: '洞察' },
];

interface HistoryEntry {
  tweet: SwipeTweet;
  action: 'confirmed' | 'skipped';
  skipReason?: SkipReason;
  skipNote?: string;
}

export default function ReviewPage() {
  const router = useRouter();
  const { userId: tgUserId, tg } = useTelegram();
  const userId = tgUserId || DEFAULT_USER_ID;

  const [cards, setCards] = useState<SwipeTweet[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [total, setTotal] = useState(0);
  const [reviewed, setReviewed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSkipSheet, setShowSkipSheet] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [activeTab, setActiveTab] = useState<RadarTab>('all');

  const remaining = cards.length - currentIndex;
  const currentCard = cards[currentIndex] ?? null;

  const fetchCards = useCallback(async (tab: RadarTab) => {
    setLoading(true);
    setError(null);
    try {
      const groupParam = tab !== 'all' ? `&group=${tab}` : '';
      const res = await fetch(`/api/cards?user_id=${userId}${groupParam}`);
      if (!res.ok) throw new Error('Failed to fetch cards');
      const data: CardsResponse = await res.json();
      setCards(data.cards);
      setTotal(data.total);
      setReviewed(data.reviewed);
      setCurrentIndex(0);
      setHistory([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchCards(activeTab);
  }, [fetchCards, activeTab]);

  useEffect(() => {
    if (!tg) return;
    if (history.length > 0) {
      tg.BackButton.show();
      const handler = () => handleUndo();
      tg.BackButton.onClick(handler);
      return () => { tg.BackButton.offClick(handler); tg.BackButton.hide(); };
    } else {
      tg.BackButton.hide();
    }
  }, [tg, history.length]);

  async function submitDecision(req: DecisionRequest) {
    try {
      await fetch('/api/decisions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      });
    } catch (err) {
      console.error('Failed to submit decision:', err);
    }
  }

  function handleConfirm() {
    if (!currentCard) return;
    setHistory(prev => [...prev, { tweet: currentCard, action: 'confirmed' }]);
    submitDecision({ tweetId: currentCard.id, userId, action: 'confirmed' });
    advance();
  }

  function handleSkipStart() {
    if (!currentCard) return;
    setShowSkipSheet(true);
  }

  function handleSkipConfirm(reason: SkipReason, note?: string) {
    if (!currentCard) return;
    setShowSkipSheet(false);
    setHistory(prev => [...prev, { tweet: currentCard, action: 'skipped', skipReason: reason, skipNote: note }]);
    submitDecision({ tweetId: currentCard.id, userId, action: 'skipped', skipReason: reason, skipNote: note });
    advance();
  }

  function advance() {
    const nextIndex = currentIndex + 1;
    setReviewed(prev => prev + 1);
    if (nextIndex >= cards.length) {
      router.push('/review/done');
    } else {
      setCurrentIndex(nextIndex);
    }
  }

  async function handleUndo() {
    if (history.length === 0) return;
    hapticFeedback('light');
    const lastEntry = history[history.length - 1];
    setHistory(prev => prev.slice(0, -1));
    setCurrentIndex(prev => Math.max(0, prev - 1));
    setReviewed(prev => Math.max(0, prev - 1));
    try {
      await fetch(`/api/decisions?tweet_id=${lastEntry.tweet.id}&user_id=${userId}`, { method: 'DELETE' });
    } catch (err) {
      console.error('Failed to undo decision:', err);
    }
  }

  function handleTabChange(tab: RadarTab) {
    if (tab === activeTab) return;
    hapticFeedback('light');
    setActiveTab(tab);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-stone-50 to-stone-100">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-4"
        >
          <div className="relative w-12 h-12 mx-auto">
            <div className="absolute inset-0 rounded-full border-2 border-stone-200" />
            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-amber-500 animate-spin" />
          </div>
          <p className="text-sm text-stone-500 font-medium">加载推文中...</p>
        </motion.div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-stone-50 to-stone-100 p-6">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-rose-50 flex items-center justify-center"><span className="text-3xl">😵</span></div>
          <p className="text-stone-600 font-medium">{error}</p>
          <button onClick={() => fetchCards(activeTab)} className="px-6 py-2.5 bg-stone-800 text-white rounded-xl text-sm font-medium hover:bg-stone-900 transition-colors active:scale-[0.97]">重试</button>
        </motion.div>
      </div>
    );
  }

  if (cards.length === 0 && !loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-stone-50 to-stone-100 flex flex-col">
        {/* Tab bar even on empty */}
        <div className="px-4 pt-4 pb-2">
          <div className="flex gap-1.5 bg-stone-100/80 rounded-xl p-1">
            {RADAR_TABS.map(tab => (
              <button key={tab.id} onClick={() => handleTabChange(tab.id)}
                className={`flex-1 py-2 px-2 rounded-lg text-xs font-medium transition-all ${activeTab === tab.id ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}>
                <span className="mr-1">{tab.icon}</span>{tab.shortLabel}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-center space-y-3">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-stone-100 flex items-center justify-center"><span className="text-3xl">📭</span></div>
            <h2 className="text-lg font-semibold text-stone-700">暂无推文</h2>
            <p className="text-sm text-stone-500">该分类下没有待处理的推文</p>
          </motion.div>
        </div>
      </div>
    );
  }

  const progress = total > 0 ? (reviewed / total) * 100 : 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 to-stone-100/80 flex flex-col">
      {/* Top bar */}
      <div className="px-4 pt-4 pb-2 space-y-3">
        {/* Radar tabs */}
        <div className="flex gap-1.5 bg-stone-100/80 rounded-xl p-1">
          {RADAR_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`flex-1 py-2 px-2 rounded-lg text-xs font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-white text-stone-800 shadow-sm'
                  : 'text-stone-500 hover:text-stone-700'
              }`}
            >
              <span className="mr-1">{tab.icon}</span>
              {tab.shortLabel}
            </button>
          ))}
        </div>

        {/* Progress + undo */}
        <div className="flex items-center gap-3">
          <div className="flex-1 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-stone-600">{remaining} 条待处理</span>
              <span className="text-stone-400">{reviewed}/{total}</span>
            </div>
            <div className="h-1.5 bg-stone-200/80 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-amber-400 to-amber-500 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              />
            </div>
          </div>
          {history.length > 0 && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={handleUndo}
              className="p-2 rounded-xl bg-white hover:bg-stone-50 text-stone-500 transition-colors shadow-sm border border-stone-200/60"
              title="撤销"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4" />
              </svg>
            </motion.button>
          )}
        </div>
      </div>

      {/* Card stack */}
      <div className="flex-1 relative px-4 pb-4">
        <div className="relative h-full min-h-[60vh]">
          <AnimatePresence mode="popLayout">
            {currentCard && (
              <SwipeCard key={currentCard.id} tweet={currentCard} onConfirm={handleConfirm} onSkip={handleSkipStart} active={true} />
            )}
            {cards[currentIndex + 1] && (
              <SwipeCard key={cards[currentIndex + 1].id} tweet={cards[currentIndex + 1]} onConfirm={() => {}} onSkip={() => {}} active={false} />
            )}
          </AnimatePresence>
        </div>
      </div>

      <SkipReasonSheet open={showSkipSheet} onClose={() => setShowSkipSheet(false)} onSubmit={handleSkipConfirm} />
    </div>
  );
}
