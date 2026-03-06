'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence } from 'framer-motion';
import { SwipeCard } from '@/components/SwipeCard';
import { SkipReasonSheet } from '@/components/SkipReasonSheet';
import { ProgressBar } from '@/components/ProgressBar';
import { useTelegram } from '@/lib/TelegramContext';
import { SwipeTweet, SkipReason, CardsResponse, DecisionRequest } from '@/lib/types';
import { hapticFeedback } from '@/lib/telegram';

const DEFAULT_USER_ID = '5134454816';

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

  const remaining = cards.length - currentIndex;
  const currentCard = cards[currentIndex] ?? null;

  const fetchCards = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/cards?user_id=${userId}`);
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
    fetchCards();
  }, [fetchCards]);

  // Telegram BackButton for undo
  useEffect(() => {
    if (!tg) return;
    if (history.length > 0) {
      tg.BackButton.show();
      const handler = () => handleUndo();
      tg.BackButton.onClick(handler);
      return () => {
        tg.BackButton.offClick(handler);
        tg.BackButton.hide();
      };
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

    submitDecision({
      tweetId: currentCard.id,
      userId,
      action: 'confirmed',
    });

    advance();
  }

  function handleSkipStart() {
    if (!currentCard) return;
    setShowSkipSheet(true);
  }

  function handleSkipConfirm(reason: SkipReason, note?: string) {
    if (!currentCard) return;
    setShowSkipSheet(false);

    setHistory(prev => [
      ...prev,
      { tweet: currentCard, action: 'skipped', skipReason: reason, skipNote: note },
    ]);

    submitDecision({
      tweetId: currentCard.id,
      userId,
      action: 'skipped',
      skipReason: reason,
      skipNote: note,
    });

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

    // Delete the decision from the server
    try {
      await fetch(
        `/api/decisions?tweet_id=${lastEntry.tweet.id}&user_id=${userId}`,
        { method: 'DELETE' }
      );
    } catch (err) {
      console.error('Failed to undo decision:', err);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="text-center space-y-3">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-stone-300 border-t-stone-600 mx-auto" />
          <p className="text-sm text-stone-500">加载推文中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50 p-6">
        <div className="text-center space-y-4">
          <div className="text-4xl">😵</div>
          <p className="text-stone-600">{error}</p>
          <button
            onClick={fetchCards}
            className="px-6 py-2 bg-stone-800 text-white rounded-xl text-sm font-medium hover:bg-stone-900"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50 p-6">
        <div className="text-center space-y-4">
          <div className="text-5xl">📭</div>
          <h2 className="text-lg font-semibold text-stone-700">今日暂无推文</h2>
          <p className="text-sm text-stone-500">等待数据同步后再来</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col">
      {/* Top bar */}
      <div className="px-4 pt-4 pb-2 space-y-3">
        <div className="flex items-center justify-between">
          <ProgressBar total={total} reviewed={reviewed} remaining={remaining} />
          {history.length > 0 && (
            <button
              onClick={handleUndo}
              className="ml-3 p-2 rounded-lg hover:bg-stone-200 text-stone-500 transition-colors"
              title="撤销"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Card stack */}
      <div className="flex-1 relative px-4 pb-4">
        <div className="relative h-full min-h-[60vh]">
          <AnimatePresence>
            {currentCard && (
              <SwipeCard
                key={currentCard.id}
                tweet={currentCard}
                onConfirm={handleConfirm}
                onSkip={handleSkipStart}
                active={true}
              />
            )}
            {/* Next card preview */}
            {cards[currentIndex + 1] && (
              <SwipeCard
                key={cards[currentIndex + 1].id}
                tweet={cards[currentIndex + 1]}
                onConfirm={() => {}}
                onSkip={() => {}}
                active={false}
              />
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Skip reason sheet */}
      <SkipReasonSheet
        open={showSkipSheet}
        onClose={() => setShowSkipSheet(false)}
        onSubmit={handleSkipConfirm}
      />
    </div>
  );
}
