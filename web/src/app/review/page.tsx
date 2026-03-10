'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { SwipeCard } from '@/components/SwipeCard';
import { SkipReasonSheet } from '@/components/SkipReasonSheet';
import { ReplyQueuePanel } from '@/components/ReplyQueuePanel';
import { useTelegram } from '@/lib/TelegramContext';
import { SwipeTweet, SkipReason, CardsResponse, DecisionRequest, ReplyQueueItem } from '@/lib/types';
import { hapticFeedback, openExternalLink } from '@/lib/telegram';

const ANGLE_LABELS: Record<string, string> = { witty: '机智', practical: '务实', subtle_product: '产品' };

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

  const [replyQueue, setReplyQueue] = useState<ReplyQueueItem[]>([]);
  const [showQueuePanel, setShowQueuePanel] = useState(false);
  const [completedItems, setCompletedItems] = useState<ReplyQueueItem[]>([]);
  const [showCompletedPanel, setShowCompletedPanel] = useState(false);
  const generatingRef = useRef(false);

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

  // Background reply generation: process one pending item at a time
  useEffect(() => {
    if (generatingRef.current) return;
    const pendingItem = replyQueue.find(item => item.status === 'pending');
    if (!pendingItem) return;

    generatingRef.current = true;

    setReplyQueue(prev => prev.map(item =>
      item.tweet.id === pendingItem.tweet.id ? { ...item, status: 'generating' } : item
    ));

    (async () => {
      try {
        const res = await fetch('/api/generate-comment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tweetUrl: pendingItem.tweet.url,
            tweetText: pendingItem.tweet.text,
            language: pendingItem.tweet.language || 'en',
          }),
        });
        const data = await res.json();
        if (data.success && data.comments?.options) {
          setReplyQueue(prev => prev.map(item =>
            item.tweet.id === pendingItem.tweet.id
              ? { ...item, status: 'done', replies: data.comments.options }
              : item
          ));
        } else {
          setReplyQueue(prev => prev.map(item =>
            item.tweet.id === pendingItem.tweet.id
              ? { ...item, status: 'error', error: data.error || '生成失败' }
              : item
          ));
        }
      } catch {
        setReplyQueue(prev => prev.map(item =>
          item.tweet.id === pendingItem.tweet.id
            ? { ...item, status: 'error', error: '网络错误' }
            : item
        ));
      } finally {
        generatingRef.current = false;
      }
    })();
  }, [replyQueue]);

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
    setReplyQueue(prev => [...prev, { tweet: currentCard, status: 'pending' }]);
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
    if (lastEntry.action === 'confirmed') {
      setReplyQueue(prev => prev.filter(item => item.tweet.id !== lastEntry.tweet.id));
    }
    try {
      await fetch(`/api/decisions?tweet_id=${lastEntry.tweet.id}&user_id=${userId}`, { method: 'DELETE' });
    } catch (err) {
      console.error('Failed to undo decision:', err);
    }
  }

  function handleRetry(tweetId: string) {
    setReplyQueue(prev => prev.map(item =>
      item.tweet.id === tweetId ? { ...item, status: 'pending', error: undefined } : item
    ));
  }

  const handleComplete = useCallback((tweetId: string, chosenAngle: string) => {
    setReplyQueue(prev => {
      const item = prev.find(i => i.tweet.id === tweetId);
      if (item) {
        setCompletedItems(old => [...old, { ...item, chosenAngle }]);
      }
      return prev.filter(i => i.tweet.id !== tweetId);
    });
  }, []);

  // When all cards are swiped, auto-expand the queue panel instead of navigating to done
  const allCardsDone = allCards.length > 0 && allCards.every(c => decidedIds.has(c.id));
  useEffect(() => {
    if (allCardsDone && !loading && replyQueue.length > 0) {
      setShowQueuePanel(true);
    }
  }, [allCardsDone, loading, replyQueue.length]);

  useEffect(() => {
    if (allCardsDone && !loading && replyQueue.length === 0 && completedItems.length === 0) {
      router.push('/review/done');
    }
  }, [allCardsDone, loading, replyQueue.length, completedItems.length, router]);

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
          <div className="flex items-center justify-between">
            <Link
              href="/"
              className="w-9 h-9 rounded-full bg-white/80 hover:bg-white border border-stone-200/40 shadow-sm flex items-center justify-center text-stone-500 hover:text-stone-700 transition-all active:scale-90"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            </Link>
            <span className="text-sm font-semibold text-stone-700">Swipe Review</span>
            {completedItems.length > 0 ? (
              <button
                onClick={() => setShowCompletedPanel(true)}
                className="relative w-9 h-9 rounded-full bg-white/80 hover:bg-white border border-stone-200/40 shadow-sm flex items-center justify-center text-emerald-500 hover:text-emerald-600 transition-all active:scale-90"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center bg-emerald-500 text-white text-[10px] font-bold rounded-full px-1">
                  {completedItems.length}
                </span>
              </button>
            ) : (
              <div className="w-9" />
            )}
          </div>

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
        <div className="relative px-4 pb-2">
          <div className={`relative w-full ${replyQueue.length > 0 ? 'h-[calc(100vh-320px)] max-h-[540px]' : 'h-[calc(100vh-260px)] max-h-[600px]'}`}>
            {filteredCards.length === 0 ? (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="absolute inset-0 flex items-center justify-center">
                <div className="text-center space-y-3">
                  <div className="w-16 h-16 mx-auto rounded-2xl bg-white shadow-lg flex items-center justify-center"><span className="text-3xl">{allCardsDone ? '✅' : '📭'}</span></div>
                  <h2 className="text-base font-semibold text-stone-600">{allCardsDone ? '全部处理完毕' : '该分类已处理完毕'}</h2>
                  <p className="text-sm text-stone-400">{allCardsDone ? '查看回复队列' : '切换其他分类继续'}</p>
                  {allCardsDone && replyQueue.length > 0 && (
                    <button
                      onClick={() => setShowQueuePanel(true)}
                      className="mt-2 px-5 py-2.5 bg-stone-800 text-white rounded-xl text-sm font-medium hover:bg-stone-900 transition-colors active:scale-[0.97]"
                    >
                      打开回复队列
                    </button>
                  )}
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

        {/* Reply queue floating bar */}
        <ReplyQueuePanel
          queue={replyQueue}
          onRetry={handleRetry}
          onComplete={handleComplete}
          expanded={showQueuePanel}
          onToggleExpand={() => setShowQueuePanel(prev => !prev)}
        />
      </div>

      <SkipReasonSheet open={showSkipSheet} onClose={() => setShowSkipSheet(false)} onSubmit={handleSkipConfirm} />

      {/* Completed replies drawer */}
      <AnimatePresence>
        {showCompletedPanel && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50"
            onClick={() => setShowCompletedPanel(false)}
          >
            <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px]" />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="absolute bottom-0 left-0 right-0 max-w-md mx-auto bg-white rounded-t-2xl shadow-2xl max-h-[85vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-stone-300" />
              </div>

              <div className="px-5 pb-3 pt-1 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-stone-800">已完成回复</h3>
                  <p className="text-xs text-stone-400 mt-0.5">
                    {completedItems.length} 条已回复 · AI 偏好学习数据收集中
                  </p>
                </div>
                <button
                  onClick={() => setShowCompletedPanel(false)}
                  className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-stone-400 hover:bg-stone-200 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-2">
                {completedItems.map((item) => {
                  const chosenReply = item.replies?.find(r => r.angle === item.chosenAngle) ?? item.replies?.[0];
                  return (
                    <div key={item.tweet.id} className="rounded-xl border border-emerald-100 bg-emerald-50/30 overflow-hidden">
                      <div className="flex items-center gap-3 px-4 py-3">
                        <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                          <svg className="w-3 h-3 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-stone-600 truncate">{item.tweet.author}</p>
                          <p className="text-[11px] text-stone-400 truncate">{item.tweet.text}</p>
                        </div>
                        <button
                          onClick={() => openExternalLink(item.tweet.intentUrl || item.tweet.url)}
                          className="text-[11px] font-medium text-blue-500 px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors shrink-0"
                        >
                          原文
                        </button>
                      </div>
                      {chosenReply && (
                        <div className="px-4 pb-3 border-t border-emerald-100/60">
                          <div className="pt-2 flex items-center gap-1.5 mb-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                              {ANGLE_LABELS[chosenReply.angle] || chosenReply.angle}
                            </span>
                          </div>
                          <p className="text-[13px] text-stone-700 leading-relaxed">{chosenReply.comment}</p>
                          {chosenReply.comment_zh && (
                            <p className="text-[11px] text-stone-400 leading-relaxed mt-1">{chosenReply.comment_zh}</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {completedItems.length === 0 && (
                  <div className="text-center py-12 text-stone-400 text-sm">
                    暂无已完成的回复
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
