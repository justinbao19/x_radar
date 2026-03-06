'use client';

import { useState } from 'react';
import { motion, useMotionValue, useTransform, PanInfo } from 'framer-motion';
import { SwipeTweet, TweetGroup, TweetComments, ReplyOption } from '@/lib/types';
import { openExternalLink, hapticFeedback } from '@/lib/telegram';

interface SwipeCardProps {
  tweet: SwipeTweet;
  onConfirm: () => void;
  onSkip: () => void;
  onDefer: () => void;
  active: boolean;
}

const GROUP_THEME: Record<TweetGroup, { gradient: string; iconBg: string; icon: string; label: string; border: string }> = {
  sentiment: { gradient: 'from-blue-500 to-indigo-600', iconBg: 'bg-white/20', icon: '⭐', label: '品牌提及', border: 'border-blue-200' },
  pain:      { gradient: 'from-rose-500 to-orange-500', iconBg: 'bg-white/20', icon: '🔥', label: '痛点', border: 'border-rose-200' },
  insight:   { gradient: 'from-purple-500 to-fuchsia-500', iconBg: 'bg-white/20', icon: '💡', label: '洞察', border: 'border-purple-200' },
  reach:     { gradient: 'from-emerald-500 to-teal-500', iconBg: 'bg-white/20', icon: '📢', label: '传播', border: 'border-emerald-200' },
};

const FALLBACK_THEME = { gradient: 'from-stone-500 to-stone-600', iconBg: 'bg-white/20', icon: '📋', label: '推文', border: 'border-stone-200' };

const ANGLE_LABELS: Record<string, string> = { witty: '机智', practical: '务实', subtle_product: '产品' };

const SWIPE_THRESHOLD = 80;
const SWIPE_EXIT = 400;

export function SwipeCard({ tweet, onConfirm, onSkip, onDefer, active }: SwipeCardProps) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 0, 200], [-10, 0, 10]);
  const cardOpacity = useTransform(x, [-SWIPE_EXIT, -200, 0, 200, SWIPE_EXIT], [0, 1, 1, 1, 0]);
  const confirmGlow = useTransform(x, [0, SWIPE_THRESHOLD * 1.5], [0, 0.25]);
  const skipGlow = useTransform(x, [-SWIPE_THRESHOLD * 1.5, 0], [0.25, 0]);
  const confirmStampOpacity = useTransform(x, [20, SWIPE_THRESHOLD], [0, 1]);
  const confirmStampScale = useTransform(x, [20, SWIPE_THRESHOLD], [0.5, 1]);
  const skipStampOpacity = useTransform(x, [-SWIPE_THRESHOLD, -20], [1, 0]);
  const skipStampScale = useTransform(x, [-SWIPE_THRESHOLD, -20], [1, 0.5]);

  const [replies, setReplies] = useState<ReplyOption[] | null>(null);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const theme = GROUP_THEME[tweet.group as TweetGroup] ?? FALLBACK_THEME;
  const showTranslation = tweet.translationZh && tweet.language &&
    !['zh', 'zh-cn', 'zh-tw'].includes(tweet.language.toLowerCase());

  function handleDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.x > SWIPE_THRESHOLD) {
      hapticFeedback('success');
      openExternalLink(tweet.url);
      onConfirm();
    } else if (info.offset.x < -SWIPE_THRESHOLD) {
      hapticFeedback('medium');
      onSkip();
    }
  }

  async function handleGenerateReplies() {
    if (loadingReplies || replies) return;
    setLoadingReplies(true);
    setReplyError(null);
    try {
      const res = await fetch('/api/generate-comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tweetUrl: tweet.url,
          tweetText: tweet.text,
          language: tweet.language || 'en',
        }),
      });
      const data = await res.json();
      if (data.success && data.comments?.options) {
        setReplies(data.comments.options);
      } else {
        setReplyError(data.error || '生成失败，请重试');
      }
    } catch (err) {
      setReplyError('网络错误，请重试');
      console.error('Failed to generate replies:', err);
    } finally {
      setLoadingReplies(false);
    }
  }

  async function handleCopy(text: string, idx: number) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(idx);
      hapticFeedback('light');
      setTimeout(() => setCopiedIdx(null), 1500);
    } catch {
      /* clipboard may not be available */
    }
  }

  return (
    <motion.div
      className={`absolute inset-0 ${active ? 'z-10 cursor-grab active:cursor-grabbing' : 'z-0 pointer-events-none'}`}
      style={active ? { x, rotate, opacity: cardOpacity } : undefined}
      drag={active ? 'x' : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.6}
      onDragEnd={handleDragEnd}
      animate={active ? { scale: 1, y: 0 } : { scale: 0.92, y: 16 }}
      exit={{ x: SWIPE_EXIT, opacity: 0, scale: 0.8, rotate: 15, transition: { duration: 0.35, ease: 'easeIn' } }}
      transition={{ type: 'spring', stiffness: 260, damping: 26 }}
    >
      <div className={`h-full rounded-3xl border-2 ${theme.border} bg-white shadow-2xl shadow-stone-300/30 overflow-hidden flex flex-col relative`}>
        {active && (
          <>
            <motion.div className="absolute inset-0 z-10 rounded-3xl pointer-events-none bg-emerald-400" style={{ opacity: confirmGlow }} />
            <motion.div className="absolute inset-0 z-10 rounded-3xl pointer-events-none bg-rose-400" style={{ opacity: skipGlow }} />
          </>
        )}
        {active && (
          <>
            <motion.div className="absolute top-6 left-5 z-20 border-[3px] border-emerald-500 text-emerald-500 px-4 py-1.5 rounded-lg font-black text-xl tracking-wider -rotate-12" style={{ opacity: confirmStampOpacity, scale: confirmStampScale }}>
              GO
            </motion.div>
            <motion.div className="absolute top-6 right-5 z-20 border-[3px] border-rose-500 text-rose-500 px-4 py-1.5 rounded-lg font-black text-xl tracking-wider rotate-12" style={{ opacity: skipStampOpacity, scale: skipStampScale }}>
              NOPE
            </motion.div>
          </>
        )}

        {/* Hero header */}
        <div className={`bg-gradient-to-br ${theme.gradient} px-5 pt-5 pb-4 relative overflow-hidden`}>
          <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-white/10" />
          <div className="absolute -bottom-4 -left-4 w-16 h-16 rounded-full bg-white/5" />
          <div className="relative z-10 flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-lg font-bold text-white border border-white/20">
                {tweet.author.replace('@', '').charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-white font-semibold text-[15px] leading-tight">{tweet.author}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`${theme.iconBg} backdrop-blur-sm text-white/90 text-[11px] font-medium px-2 py-0.5 rounded-full border border-white/10`}>
                    {theme.icon} {theme.label}
                  </span>
                  {tweet.aiPicked && (
                    <span className="bg-amber-400/90 text-amber-900 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                      <span className="w-1 h-1 rounded-full bg-amber-900 animate-pulse" />AI 精选
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="text-right">
              <span className="text-2xl font-black text-white/90">{Math.round(tweet.finalScore)}</span>
              <p className="text-[10px] text-white/60 font-medium uppercase tracking-wider">Score</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <p className="text-[16px] leading-[1.7] text-stone-800">{tweet.text}</p>

          {showTranslation && (
            <div className="border-l-[3px] border-amber-400 pl-3 py-1">
              <p className="text-[13px] leading-relaxed text-stone-500">{tweet.translationZh}</p>
            </div>
          )}

          <div className="flex items-center gap-4 text-xs text-stone-400 pt-1">
            <span className="flex items-center gap-1"><span className="text-rose-400">♥</span> {tweet.engagement.likes}</span>
            <span className="flex items-center gap-1"><span className="text-blue-400">💬</span> {tweet.engagement.replies}</span>
            <span className="flex items-center gap-1"><span className="text-emerald-400">↻</span> {tweet.engagement.retweets}</span>
          </div>

          {tweet.reason && <p className="text-[11px] text-stone-400 leading-relaxed">{tweet.reason}</p>}

          {/* Generate replies section */}
          {!replies && !loadingReplies && (
            <button
              onClick={handleGenerateReplies}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/60 text-amber-700 text-sm font-medium hover:from-amber-100 hover:to-orange-100 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
              AI 生成回复建议
            </button>
          )}

          {loadingReplies && (
            <div className="w-full py-4 flex items-center justify-center gap-2 text-sm text-amber-600">
              <div className="w-4 h-4 border-2 border-amber-200 border-t-amber-500 rounded-full animate-spin" />
              生成中...
            </div>
          )}

          {replyError && !loadingReplies && !replies && (
            <div className="w-full py-3 px-4 rounded-xl bg-rose-50 border border-rose-200/60 text-center space-y-2">
              <p className="text-xs text-rose-600">{replyError}</p>
              <button
                onClick={() => { setReplyError(null); handleGenerateReplies(); }}
                className="text-xs font-medium text-rose-700 underline underline-offset-2 hover:text-rose-800"
              >
                点击重试
              </button>
            </div>
          )}

          {replies && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider">回复建议</p>
              {replies.map((opt, idx) => (
                <div key={idx} className={`rounded-xl border p-3 space-y-1.5 ${opt.recommended ? 'border-amber-300 bg-amber-50/50' : 'border-stone-200 bg-stone-50/50'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${opt.recommended ? 'bg-amber-200 text-amber-800' : 'bg-stone-200 text-stone-600'}`}>
                        {ANGLE_LABELS[opt.angle] || opt.angle}
                      </span>
                      {opt.recommended && <span className="text-[10px] text-amber-600 font-medium">推荐</span>}
                    </div>
                    <button
                      onClick={() => handleCopy(opt.comment, idx)}
                      className="text-[11px] font-medium px-2 py-1 rounded-lg hover:bg-stone-200/50 transition-colors flex items-center gap-1"
                    >
                      {copiedIdx === idx ? (
                        <><svg className="w-3 h-3 text-emerald-500" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg><span className="text-emerald-600">已复制</span></>
                      ) : (
                        <><svg className="w-3 h-3 text-stone-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg><span className="text-stone-500">复制</span></>
                      )}
                    </button>
                  </div>
                  <p className="text-[13px] text-stone-700 leading-relaxed">{opt.comment}</p>
                  {opt.comment_zh && <p className="text-[11px] text-stone-400 leading-relaxed">{opt.comment_zh}</p>}
                  <p className="text-[11px] text-stone-400 italic">{opt.zh_explain}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="px-5 py-4 border-t border-stone-100 bg-gradient-to-t from-stone-50/80 to-white">
          <div className="flex items-center justify-center gap-4">
            {/* Skip (left) - with reason */}
            <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
              onClick={() => { hapticFeedback('medium'); onSkip(); }}
              className="w-14 h-14 rounded-full bg-white border-2 border-rose-200 text-rose-500 flex items-center justify-center shadow-lg shadow-rose-100/50 hover:border-rose-300 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </motion.button>

            {/* Defer (middle) - skip for now, stay in queue */}
            <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
              onClick={() => { hapticFeedback('light'); onDefer(); }}
              className="w-10 h-10 rounded-full bg-white border-2 border-stone-200 text-stone-400 flex items-center justify-center shadow-md hover:border-stone-300 hover:text-stone-500 transition-colors"
              title="稍后处理"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </motion.button>

            {/* Confirm (right) - go to tweet */}
            <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
              onClick={() => { hapticFeedback('success'); openExternalLink(tweet.url); onConfirm(); }}
              className="w-14 h-14 rounded-full bg-white border-2 border-emerald-200 text-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-100/50 hover:border-emerald-300 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
            </motion.button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
