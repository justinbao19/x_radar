'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { SwipeCard } from '@/components/SwipeCard';
import { SkipReasonSheet } from '@/components/SkipReasonSheet';
import { useTelegram } from '@/lib/TelegramContext';
import { SwipeTweet, SkipReason, CardsResponse, DecisionRequest } from '@/lib/types';
import { hapticFeedback } from '@/lib/telegram';

const DEFAULT_USER_ID = '5134454816';

type RadarTab = 'all' | 'pain_radar' | 'filo_sentiment' | 'user_insight';

const RADAR_TABS: { id: RadarTab; label: string; icon: string }[] = [
  { id: 'all', label: '全部', icon: '📋' },
  { id: 'pain_radar', label: '痛点', icon: '🔥' },
  { id: 'filo_sentiment', label: '舆情', icon: '⭐' },
  { id: 'user_insight', label: '洞察', icon: '💡' },
];

const GROUP_MAP: Record<string, string[]> = {
  pain_radar: ['pain', 'reach'],
  filo_sentiment: ['sentiment'],
  user_insight: ['insight'],
};

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

  const [allCards, setAllCards] = useState<SwipeTweet[]>([]);
  const [decidedIds, setDecidedIds] = useState<Set<string>>(new Set());
  const [deferredIds, setDeferredIds] = useState<Set<string>>(new Set());
  const [totalFromServer, setTotalFromServer] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSkipSheet, setShowSkipSheet] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [activeTab, setActiveTab] = useState<RadarTab>('all');

  const filteredCards = useMemo(() => {
    const undecided = allCards.filter(c => !decidedIds.has(c.id) && !deferredIds.has(c.id));
    if (activeTab === 'all') return undecided;
    const allowed = GROUP_MAP[activeTab];
    if (!allowed) return undecided;
    return undecided.filter(c => c.group && allowed.includes(c.group));
  }, [allCards, decidedIds, deferredIds, activeTab]);

  const tabCounts = useMemo(() => {
    const undecided = allCards.filter(c => !decidedIds.has(c.id));
    return {
      all: undecided.length,
      pain_radar: undecided.filter(c => c.group && GROUP_MAP.pain_radar.includes(c.group)).length,
      filo_sentiment: undecided.filter(c => c.group === 'sentiment').length,
      user_insight: undecided.filter(c => c.group === 'insight').length,
    };
  }, [allCards, decidedIds]);

  const currentCard = filteredCards[0] ?? null;
  const nextCard = filteredCards[1] ?? null;
  const totalDecided = decidedIds.size;
  const remaining = filteredCards.length;

  const fetchCards = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/cards?user_id=${userId}`);
      if (!res.ok) throw new Error('Failed to fetch cards');
      const data: CardsResponse = await res.json();
      setAllCards(data.cards);
      setTotalFromServer(data.total);
      setDecidedIds(new Set());
      setHistory([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { fetchCards(); }, [fetchCards]);

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
    setDecidedIds(prev => new Set(prev).add(currentCard.id));
    submitDecision({ tweetId: currentCard.id, userId, action: 'confirmed' });
  }

  function handleSkipStart() {
    if (!currentCard) return;
    setShowSkipSheet(true);
  }

  function handleSkipConfirm(reason: SkipReason, note?: string) {
    if (!currentCard) return;
    setShowSkipSheet(false);
    hapticFeedback('medium');
    setHistory(prev => [...prev, { tweet: currentCard, action: 'skipped', skipReason: reason, skipNote: note }]);
    setDecidedIds(prev => new Set(prev).add(currentCard.id));
    submitDecision({ tweetId: currentCard.id, userId, action: 'skipped', skipReason: reason, skipNote: note });
  }

  function handleDefer() {
    if (!currentCard) return;
    setDeferredIds(prev => new Set(prev).add(currentCard.id));
  }

  async function handleUndo() {
    if (history.length === 0) return;
    hapticFeedback('light');
    const lastEntry = history[history.length - 1];
    setHistory(prev => prev.slice(0, -1));
    setDecidedIds(prev => {
      const next = new Set(prev);
      next.delete(lastEntry.tweet.id);
      return next;
    });
    try {
      await fetch(`/api/decisions?tweet_id=${lastEntry.tweet.id}&user_id=${userId}`, { method: 'DELETE' });
    } catch (err) {
      console.error('Failed to undo decision:', err);
    }
  }

  // Check if all cards across all tabs are done
  const allDone = allCards.length > 0 && allCards.every(c => decidedIds.has(c.id));
  useEffect(() => {
    if (allDone && !loading) router.push('/review/done');
  }, [allDone, loading, router]);

  const progress = totalFromServer > 0 ? (totalDecided / totalFromServer) * 100 : 0;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-stone-100 via-stone-50 to-amber-50/30">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-center space-y-4">
          <div className="relative w-14 h-14 mx-auto">
            <div className="absolute inset-0 rounded-full border-[3px] border-stone-200" />
            <div className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-amber-500 animate-spin" />
          </div>
          <p className="text-sm text-stone-500 font-medium">加载推文中...</p>
        </motion.div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-stone-100 via-stone-50 to-amber-50/30 p-6">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center space-y-4 max-w-md mx-auto">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-rose-50 flex items-center justify-center"><span className="text-3xl">😵</span></div>
          <p className="text-stone-600 font-medium">{error}</p>
          <button onClick={fetchCards} className="px-6 py-2.5 bg-stone-800 text-white rounded-xl text-sm font-medium hover:bg-stone-900 transition-colors active:scale-[0.97]">重试</button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-100 via-stone-50 to-amber-50/30 flex flex-col">
      <div className="max-w-md mx-auto w-full flex flex-col flex-1">
        {/* Top bar */}
        <div className="px-4 pt-3 pb-2 space-y-3">
          {/* Header: back + title */}
          <div className="flex items-center justify-between">
            <Link
              href="/"
              className="w-9 h-9 rounded-full bg-white/80 hover:bg-white border border-stone-200/40 shadow-sm flex items-center justify-center text-stone-500 hover:text-stone-700 transition-all active:scale-90"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            </Link>
            <span className="text-sm font-semibold text-stone-700">Swipe Review</span>
            <div className="w-9" />
          </div>

          {/* Radar tabs */}
          <div className="flex gap-1 bg-white/60 backdrop-blur-sm rounded-2xl p-1 border border-stone-200/40 shadow-sm">
            {RADAR_TABS.map(tab => {
              const count = tabCounts[tab.id];
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => { if (!isActive) { hapticFeedback('light'); setActiveTab(tab.id); } }}
                  className={`flex-1 py-2 px-1 rounded-xl text-xs font-semibold transition-all relative ${
                    isActive
                      ? 'bg-white text-stone-800 shadow-md'
                      : 'text-stone-400 hover:text-stone-600'
                  }`}
                >
                  <span className="mr-0.5">{tab.icon}</span>
                  {tab.label}
                  {count > 0 && (
                    <span className={`ml-1 text-[10px] font-bold ${isActive ? 'text-amber-600' : 'text-stone-300'}`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Progress bar */}
          <div className="flex items-center gap-3">
            <div className="flex-1 space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-stone-600">{remaining} 条待处理</span>
                <span className="text-stone-400 tabular-nums">{totalDecided}/{totalFromServer}</span>
              </div>
              <div className="h-2 bg-white/80 rounded-full overflow-hidden shadow-inner border border-stone-200/40">
                <motion.div
                  className="h-full bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500 rounded-full"
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                />
              </div>
            </div>
            {history.length > 0 && (
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={handleUndo}
                className="w-9 h-9 rounded-full bg-white hover:bg-stone-50 text-stone-500 transition-all shadow-md border border-stone-200/40 flex items-center justify-center active:scale-90"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4" />
                </svg>
              </motion.button>
            )}
          </div>
        </div>

        {/* Card stack area */}
        <div className="flex-1 relative px-4 pb-4">
          <div className="relative w-full h-[calc(100vh-200px)] max-h-[680px]">
            {filteredCards.length === 0 ? (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="absolute inset-0 flex items-center justify-center">
                <div className="text-center space-y-3">
                  <div className="w-16 h-16 mx-auto rounded-2xl bg-white shadow-lg flex items-center justify-center"><span className="text-3xl">📭</span></div>
                  <h2 className="text-base font-semibold text-stone-600">该分类已处理完毕</h2>
                  <p className="text-sm text-stone-400">切换其他分类继续</p>
                </div>
              </motion.div>
            ) : (
              <AnimatePresence mode="popLayout">
                {nextCard && (
                  <SwipeCard key={nextCard.id} tweet={nextCard} onConfirm={() => {}} onSkip={() => {}} onDefer={() => {}} active={false} />
                )}
                {currentCard && (
                  <SwipeCard key={currentCard.id} tweet={currentCard} onConfirm={handleConfirm} onSkip={handleSkipStart} onDefer={handleDefer} active={true} />
                )}
              </AnimatePresence>
            )}
          </div>
        </div>
      </div>

      <SkipReasonSheet open={showSkipSheet} onClose={() => setShowSkipSheet(false)} onSubmit={handleSkipConfirm} />
    </div>
  );
}
