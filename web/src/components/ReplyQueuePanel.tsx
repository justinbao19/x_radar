'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ReplyQueueItem } from '@/lib/types';
import { openExternalLink, hapticFeedback } from '@/lib/telegram';
import { normalizeLanguageTag, shouldShowChineseTranslation } from '@/lib/language';

const ANGLE_LABELS: Record<string, string> = { witty: '机智', practical: '务实', subtle_product: '产品' };

interface ReplyQueuePanelProps {
  queue: ReplyQueueItem[];
  onRetry: (tweetId: string) => void;
  onComplete: (tweetId: string, chosenAngle: string) => void;
  expanded: boolean;
  onToggleExpand: () => void;
}

export function ReplyQueuePanel({ queue, onRetry, onComplete, expanded, onToggleExpand }: ReplyQueuePanelProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState<Record<string, number>>({});
  const [actionState, setActionState] = useState<Record<string, { copied: boolean; visited: boolean; angle?: string }>>({});
  const [expandedPreview, setExpandedPreview] = useState<Record<string, boolean>>({});

  const doneCount = queue.filter(i => i.status === 'done').length;
  const errorCount = queue.filter(i => i.status === 'error').length;
  const total = queue.length;
  const allDone = total > 0 && doneCount + errorCount === total;
  const progress = total > 0 ? (doneCount / total) * 100 : 0;

  const getActiveIdx = useCallback((item: ReplyQueueItem): number => {
    if (selectedTab[item.tweet.id] != null) return selectedTab[item.tweet.id];
    const recIdx = item.replies?.findIndex(r => r.recommended) ?? -1;
    return recIdx >= 0 ? recIdx : 0;
  }, [selectedTab]);

  async function handleCopy(text: string, tweetId: string, angle: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(tweetId);
      hapticFeedback('light');
      setTimeout(() => setCopiedKey(null), 1500);
      setActionState(prev => ({
        ...prev,
        [tweetId]: { ...prev[tweetId], copied: true, angle },
      }));
    } catch { /* clipboard may not be available */ }
  }

  function handleVisit(tweetId: string, url: string, markVisited = true) {
    openExternalLink(url);
    if (!markVisited) return;

    setActionState(prev => ({
      ...prev,
      [tweetId]: { ...prev[tweetId], visited: true },
    }));
  }

  useEffect(() => {
    for (const [tweetId, state] of Object.entries(actionState)) {
      if (state.copied && state.visited && state.angle) {
        hapticFeedback('success');
        onComplete(tweetId, state.angle);
        setActionState(prev => {
          const next = { ...prev };
          delete next[tweetId];
          return next;
        });
        break;
      }
    }
  }, [actionState, onComplete]);

  if (total === 0) return null;

  return (
    <>
      {/* Collapsed floating bar */}
      {!expanded && (
        <div className="px-4 pb-3 pt-1">
          <button
            onClick={onToggleExpand}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-white border border-stone-200/60 shadow-lg shadow-stone-200/30 active:scale-[0.98] transition-transform"
          >
            <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
              {allDone ? (
                <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              ) : (
                <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-stone-700">
                  {allDone ? '回复已就绪' : '回复队列'}
                </span>
                <span className="text-[11px] font-medium text-stone-400 tabular-nums">{doneCount}/{total}</span>
              </div>
              <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                <motion.div
                  className={`h-full rounded-full ${allDone ? 'bg-emerald-400' : 'bg-amber-400'}`}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.4 }}
                />
              </div>
            </div>
            <svg className="w-4 h-4 text-stone-300 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" /></svg>
          </button>
        </div>
      )}

      {/* Expanded drawer */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50"
            onClick={onToggleExpand}
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
              {/* Drag handle */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-stone-300" />
              </div>

              {/* Header */}
              <div className="px-5 pb-3 pt-1 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-stone-800">回复队列</h3>
                  <p className="text-xs text-stone-400 mt-0.5">
                    {allDone
                      ? '全部生成完毕，去回复吧'
                      : `已完成 ${doneCount}/${total}`}
                  </p>
                </div>
                <button
                  onClick={onToggleExpand}
                  className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-stone-400 hover:bg-stone-200 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                </button>
              </div>

              {/* Progress bar */}
              <div className="px-5 pb-3">
                <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
                  <motion.div
                    className={`h-full rounded-full ${allDone ? 'bg-emerald-400' : 'bg-amber-400'}`}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.4 }}
                  />
                </div>
              </div>

              {/* Queue list */}
              <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-2">
                <AnimatePresence mode="popLayout">
                  {queue.map((item) => {
                    const activeIdx = getActiveIdx(item);
                    const activeReply = item.replies?.[activeIdx];
                    const actions = actionState[item.tweet.id];
                    const showTranslation = shouldShowChineseTranslation(item.tweet.language, item.tweet.translationZh);
                    const isExpanded = expandedPreview[item.tweet.id] ?? false;
                    const textClampClass = isExpanded ? '' : 'line-clamp-3';
                    const translationClampClass = isExpanded ? '' : 'line-clamp-2';

                    return (
                      <motion.div
                        key={item.tweet.id}
                        layout
                        exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.25 } }}
                        className="rounded-xl border border-stone-200 bg-white overflow-hidden"
                      >
                        {/* Tweet preview */}
                        <div className="px-4 py-3 space-y-2.5">
                          <div className="flex items-start gap-3">
                            <StatusIcon status={item.status} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-xs font-semibold text-stone-600 truncate">{item.tweet.author}</p>
                                {item.tweet.language && (
                                  <span className="shrink-0 rounded-full bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-stone-500">
                                    {normalizeLanguageTag(item.tweet.language).toUpperCase()}
                                  </span>
                                )}
                              </div>
                              <p className={`mt-1 text-[12px] leading-relaxed text-stone-700 ${textClampClass}`}>{item.tweet.text}</p>
                              {showTranslation && (
                                <div className="mt-2 rounded-lg bg-amber-50/70 px-2.5 py-2">
                                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700">中文理解</p>
                                  <p className={`text-[11px] leading-relaxed text-stone-500 ${translationClampClass}`}>{item.tweet.translationZh}</p>
                                </div>
                              )}
                            </div>
                            <div className="flex flex-col items-end gap-1 shrink-0">
                              {actions?.copied && !actions?.visited && (
                                <span className="text-[10px] font-medium text-emerald-500 bg-emerald-50 px-1.5 py-0.5 rounded-full">已复制</span>
                              )}
                              {item.status === 'error' && (
                                <button
                                  onClick={() => onRetry(item.tweet.id)}
                                  className="text-[11px] font-medium text-rose-500 hover:text-rose-600 px-2 py-1 rounded-lg hover:bg-rose-50 transition-colors"
                                >
                                  重试
                                </button>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-2">
                            <button
                              onClick={() => setExpandedPreview(prev => ({ ...prev, [item.tweet.id]: !isExpanded }))}
                              className="text-[11px] font-medium text-stone-500 hover:text-stone-700 transition-colors"
                            >
                              {isExpanded ? '收起预览' : '展开预览'}
                            </button>
                            <button
                              onClick={() => handleVisit(item.tweet.id, item.tweet.url, false)}
                              className="text-[11px] font-medium text-blue-500 hover:text-blue-600 px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors"
                            >
                              查看原文
                            </button>
                          </div>
                        </div>

                        {/* Generated replies with tab switching (when done) */}
                        {item.status === 'done' && item.replies && item.replies.length > 0 && (
                          <div className="px-4 pb-3 pt-0 space-y-2 border-t border-stone-100">
                            {/* Angle tabs */}
                            <div className="flex gap-1.5 pt-2">
                              {item.replies.map((reply, idx) => (
                                <button
                                  key={reply.angle}
                                  onClick={() => setSelectedTab(prev => ({ ...prev, [item.tweet.id]: idx }))}
                                  className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                                    activeIdx === idx
                                      ? 'bg-amber-100 text-amber-700'
                                      : 'bg-stone-100 text-stone-400 hover:text-stone-600'
                                  }`}
                                >
                                  {ANGLE_LABELS[reply.angle] || reply.angle}
                                  {reply.recommended && ' ★'}
                                </button>
                              ))}
                            </div>

                            {/* Active reply content */}
                            {activeReply && (
                              <>
                                <p className="text-[13px] text-stone-700 leading-relaxed">{activeReply.comment}</p>
                                {activeReply.comment_zh && (
                                  <p className="text-[11px] text-stone-400 leading-relaxed">{activeReply.comment_zh}</p>
                                )}
                              </>
                            )}

                            {/* Copy + Visit buttons */}
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => activeReply && handleCopy(activeReply.comment, item.tweet.id, activeReply.angle)}
                                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border text-xs font-medium transition-colors active:scale-[0.98] ${
                                  actions?.copied
                                    ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
                                    : 'bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100'
                                }`}
                              >
                                {copiedKey === item.tweet.id ? (
                                  <><svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>已复制</>
                                ) : actions?.copied ? (
                                  <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>已复制</>
                                ) : (
                                  <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>复制</>
                                )}
                              </button>
                              <button
                                onClick={() => handleVisit(item.tweet.id, item.tweet.intentUrl || item.tweet.url)}
                                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border text-xs font-medium transition-colors active:scale-[0.98] ${
                                  actions?.visited
                                    ? 'bg-blue-100 border-blue-300 text-blue-700'
                                    : 'bg-blue-50 border-blue-200 text-blue-600 hover:bg-blue-100'
                                }`}
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                                {actions?.visited ? '已跳转' : '去回复'}
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Error message */}
                        {item.status === 'error' && item.error && (
                          <div className="px-4 pb-3 border-t border-stone-100">
                            <p className="text-[11px] text-rose-500 pt-2">{item.error}</p>
                          </div>
                        )}
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function StatusIcon({ status }: { status: ReplyQueueItem['status'] }) {
  switch (status) {
    case 'pending':
      return <div className="w-5 h-5 rounded-full bg-stone-100 border-2 border-stone-200 shrink-0" />;
    case 'generating':
      return <div className="w-5 h-5 rounded-full border-2 border-stone-200 border-t-amber-500 animate-spin shrink-0" />;
    case 'done':
      return (
        <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
          <svg className="w-3 h-3 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
        </div>
      );
    case 'error':
      return (
        <div className="w-5 h-5 rounded-full bg-rose-100 flex items-center justify-center shrink-0">
          <svg className="w-3 h-3 text-rose-600" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </div>
      );
  }
}
