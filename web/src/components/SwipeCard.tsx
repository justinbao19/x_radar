'use client';

import { motion, useMotionValue, useTransform, PanInfo } from 'framer-motion';
import { SwipeTweet, TweetGroup } from '@/lib/types';
import { openExternalLink, hapticFeedback } from '@/lib/telegram';
import { GroupBadge } from './GroupBadge';
import { EngagementBadge } from './EngagementBadge';

interface SwipeCardProps {
  tweet: SwipeTweet;
  onConfirm: () => void;
  onSkip: () => void;
  active: boolean;
}

const GROUP_STYLES: Record<TweetGroup, { border: string; headerBg: string; accent: string }> = {
  sentiment: { border: 'border-blue-300/60', headerBg: 'from-blue-50 to-indigo-50/50', accent: 'text-blue-600' },
  pain: { border: 'border-rose-300/60', headerBg: 'from-rose-50 to-orange-50/50', accent: 'text-rose-600' },
  insight: { border: 'border-purple-300/60', headerBg: 'from-purple-50 to-fuchsia-50/50', accent: 'text-purple-600' },
  reach: { border: 'border-emerald-300/60', headerBg: 'from-emerald-50 to-teal-50/50', accent: 'text-emerald-600' },
};

const SWIPE_THRESHOLD = 100;

export function SwipeCard({ tweet, onConfirm, onSkip, active }: SwipeCardProps) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 0, 200], [-8, 0, 8]);
  const opacity = useTransform(x, [-300, -100, 0, 100, 300], [0.3, 1, 1, 1, 0.3]);
  const confirmOpacity = useTransform(x, [0, SWIPE_THRESHOLD], [0, 1]);
  const skipOpacity = useTransform(x, [-SWIPE_THRESHOLD, 0], [1, 0]);
  const confirmScale = useTransform(x, [0, SWIPE_THRESHOLD], [0.5, 1]);
  const skipScale = useTransform(x, [-SWIPE_THRESHOLD, 0], [1, 0.5]);

  const groupStyle = GROUP_STYLES[tweet.group as TweetGroup] ?? {
    border: 'border-stone-200/60',
    headerBg: 'from-stone-50 to-stone-100/50',
    accent: 'text-stone-600',
  };

  const showTranslation = tweet.translationZh && tweet.language &&
    !['zh', 'zh-cn', 'zh-tw'].includes(tweet.language.toLowerCase());

  function handleDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.x > SWIPE_THRESHOLD) {
      hapticFeedback('success');
      onConfirm();
    } else if (info.offset.x < -SWIPE_THRESHOLD) {
      hapticFeedback('medium');
      onSkip();
    }
  }

  return (
    <motion.div
      className={`absolute inset-0 ${active ? 'z-10' : 'z-0'}`}
      style={{ x, rotate, opacity }}
      drag={active ? 'x' : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.7}
      onDragEnd={handleDragEnd}
      animate={active ? { scale: 1, y: 0 } : { scale: 0.95, y: 10 }}
      exit={{ x: 300, opacity: 0, transition: { duration: 0.25 } }}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
    >
      <div className={`h-full rounded-2xl border ${groupStyle.border} bg-white shadow-lg shadow-stone-200/50 overflow-hidden flex flex-col`}>
        {/* Swipe indicators */}
        <motion.div
          className="absolute top-8 right-6 z-20 flex items-center gap-2 bg-emerald-500/95 backdrop-blur-sm text-white px-5 py-2.5 rounded-2xl font-bold text-base shadow-xl shadow-emerald-500/20 -rotate-6"
          style={{ opacity: confirmOpacity, scale: confirmScale }}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
          REPLY
        </motion.div>
        <motion.div
          className="absolute top-8 left-6 z-20 flex items-center gap-2 bg-rose-500/95 backdrop-blur-sm text-white px-5 py-2.5 rounded-2xl font-bold text-base shadow-xl shadow-rose-500/20 rotate-6"
          style={{ opacity: skipOpacity, scale: skipScale }}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
          SKIP
        </motion.div>

        {/* Header */}
        <div className={`bg-gradient-to-r ${groupStyle.headerBg} px-5 pt-4 pb-3 border-b border-stone-100/80`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className={`w-9 h-9 rounded-full bg-gradient-to-br from-stone-100 to-stone-200 flex items-center justify-center text-sm font-bold ${groupStyle.accent}`}>
                {tweet.author.replace('@', '').charAt(0).toUpperCase()}
              </div>
              <div>
                <span className="text-sm font-semibold text-stone-800">{tweet.author}</span>
                {tweet.aiPicked && (
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                    <span className="text-[10px] font-medium text-amber-600 uppercase tracking-wider">AI 精选</span>
                  </div>
                )}
              </div>
            </div>
            <GroupBadge group={tweet.group} />
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3.5">
          {/* Original text */}
          <p className="text-[15px] leading-[1.65] text-stone-800 font-normal">{tweet.text}</p>

          {/* Translation */}
          {showTranslation && (
            <div className="relative pl-3 border-l-2 border-amber-300/70">
              <p className="text-[13px] leading-relaxed text-stone-500 bg-amber-50/40 rounded-r-lg px-3 py-2">
                {tweet.translationZh}
              </p>
            </div>
          )}

          {/* Engagement + Score row */}
          <div className="flex items-center justify-between pt-1">
            <EngagementBadge
              likes={tweet.engagement.likes}
              replies={tweet.engagement.replies}
              retweets={tweet.engagement.retweets}
            />
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-stone-400">Score</span>
              <span className={`text-sm font-bold ${tweet.finalScore >= 500 ? 'text-amber-600' : tweet.finalScore >= 200 ? 'text-orange-500' : 'text-stone-500'}`}>
                {Math.round(tweet.finalScore)}
              </span>
            </div>
          </div>

          {/* Reason */}
          {tweet.reason && (
            <p className="text-xs text-stone-400 leading-relaxed">{tweet.reason}</p>
          )}

          {/* View original */}
          <button
            onClick={(e) => { e.stopPropagation(); openExternalLink(tweet.url); }}
            className="inline-flex items-center gap-1.5 text-xs text-blue-500 hover:text-blue-600 font-medium transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
            查看原文
          </button>

          {/* Reply angle */}
          {tweet.replyAngle && (
            <div className="bg-stone-50/80 rounded-xl p-3 border border-stone-100/80">
              <div className="flex items-center gap-1.5 mb-1">
                <svg className="w-3.5 h-3.5 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                <span className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider">回复角度</span>
              </div>
              <p className="text-sm text-stone-600">{tweet.replyAngle}</p>
            </div>
          )}
        </div>

        {/* Bottom action buttons */}
        <div className="p-4 pt-3 border-t border-stone-100/80 bg-gradient-to-t from-stone-50/50 to-transparent">
          <div className="flex gap-3">
            <button
              onClick={() => { hapticFeedback('medium'); onSkip(); }}
              className="flex-1 py-3 rounded-xl bg-stone-100 hover:bg-stone-200/80 text-stone-600 font-medium text-sm transition-all active:scale-[0.97] flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              跳过
            </button>
            <button
              onClick={() => { hapticFeedback('success'); onConfirm(); }}
              className="flex-1 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-medium text-sm transition-all active:scale-[0.97] shadow-sm shadow-emerald-500/20 flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              回复
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
