'use client';

import { useRef } from 'react';
import { motion, useMotionValue, useTransform, animate, PanInfo } from 'framer-motion';
import { SwipeTweet, TweetGroup } from '@/lib/types';
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

const SWIPE_THRESHOLD = 80;
const SWIPE_EXIT = 400;

export function SwipeCard({ tweet, onConfirm, onSkip, onDefer, active }: SwipeCardProps) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 0, 200], [-10, 0, 10]);
  const confirmGlow = useTransform(x, [0, SWIPE_THRESHOLD], [0, 0.25]);
  const skipGlow = useTransform(x, [-SWIPE_THRESHOLD, 0], [0.25, 0]);
  const confirmStampOpacity = useTransform(x, [20, SWIPE_THRESHOLD], [0, 1]);
  const confirmStampScale = useTransform(x, [20, SWIPE_THRESHOLD], [0.5, 1]);
  const skipStampOpacity = useTransform(x, [-SWIPE_THRESHOLD, -20], [1, 0]);
  const skipStampScale = useTransform(x, [-SWIPE_THRESHOLD, -20], [1, 0.5]);

  const exitDirectionRef = useRef(1);

  const theme = GROUP_THEME[tweet.group as TweetGroup] ?? FALLBACK_THEME;
  const showTranslation = tweet.translationZh && tweet.language &&
    !['zh', 'zh-cn', 'zh-tw'].includes(tweet.language.toLowerCase());

  function handleDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.x > SWIPE_THRESHOLD) {
      exitDirectionRef.current = 1;
      animate(x, SWIPE_EXIT, { duration: 0.3, ease: 'easeIn' });
      hapticFeedback('success');
      onConfirm();
    } else if (info.offset.x < -SWIPE_THRESHOLD) {
      exitDirectionRef.current = -1;
      animate(x, -SWIPE_EXIT, { duration: 0.3, ease: 'easeIn' });
      hapticFeedback('medium');
      onSkip();
    } else {
      animate(x, 0, { type: 'spring', stiffness: 300, damping: 24 });
    }
  }

  return (
    <motion.div
      className={`absolute inset-0 ${active ? 'z-10 cursor-grab active:cursor-grabbing' : 'z-0 pointer-events-none'}`}
      style={active ? { x, rotate, touchAction: 'pan-y' } : undefined}
      drag={active ? 'x' : false}
      dragElastic={0.8}
      onDragEnd={handleDragEnd}
      animate={active ? { scale: 1, y: 0, opacity: 1 } : { scale: 0.92, y: 16, opacity: 1 }}
      exit={{
        x: exitDirectionRef.current * SWIPE_EXIT,
        opacity: 0,
        scale: 0.8,
        rotate: exitDirectionRef.current * 15,
        transition: { duration: 0.3, ease: 'easeIn' },
      }}
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
              REPLY
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
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-3" style={{ touchAction: 'pan-y' }}>
          <p className="text-[16px] leading-[1.7] text-stone-800">{tweet.text}</p>

          {showTranslation && (
            <div className="border-l-[3px] border-amber-400 pl-3 py-1">
              <p className="text-[13px] leading-relaxed text-stone-500">{tweet.translationZh}</p>
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-4 text-xs text-stone-400">
              <span className="flex items-center gap-1"><span className="text-rose-400">♥</span> {tweet.engagement.likes}</span>
              <span className="flex items-center gap-1"><span className="text-blue-400">💬</span> {tweet.engagement.replies}</span>
              <span className="flex items-center gap-1"><span className="text-emerald-400">↻</span> {tweet.engagement.retweets}</span>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); openExternalLink(tweet.url); }}
              className="flex items-center gap-1 text-[11px] font-medium text-blue-500 hover:text-blue-600 px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
              查看原文
            </button>
          </div>

          {tweet.reason && <p className="text-[11px] text-stone-400 leading-relaxed">{tweet.reason}</p>}
        </div>

        {/* Action buttons */}
        <div className="px-5 py-4 border-t border-stone-100 bg-gradient-to-t from-stone-50/80 to-white">
          <div className="flex items-center justify-center gap-4">
            <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
              onClick={() => {
                exitDirectionRef.current = -1;
                animate(x, -SWIPE_EXIT, { duration: 0.3, ease: 'easeIn' });
                hapticFeedback('medium');
                onSkip();
              }}
              className="w-14 h-14 rounded-full bg-white border-2 border-rose-200 text-rose-500 flex items-center justify-center shadow-lg shadow-rose-100/50 hover:border-rose-300 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </motion.button>

            <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
              onClick={() => { hapticFeedback('light'); onDefer(); }}
              className="w-10 h-10 rounded-full bg-white border-2 border-stone-200 text-stone-400 flex items-center justify-center shadow-md hover:border-stone-300 hover:text-stone-500 transition-colors"
              title="稍后处理"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </motion.button>

            <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
              onClick={() => {
                exitDirectionRef.current = 1;
                animate(x, SWIPE_EXIT, { duration: 0.3, ease: 'easeIn' });
                hapticFeedback('success');
                onConfirm();
              }}
              className="w-14 h-14 rounded-full bg-white border-2 border-emerald-200 text-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-100/50 hover:border-emerald-300 transition-colors"
            >
              <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
            </motion.button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
