'use client';

import { motion, useMotionValue, useTransform, PanInfo } from 'framer-motion';
import { SwipeTweet, TweetGroup } from '@/lib/types';
import { openExternalLink, hapticFeedback } from '@/lib/telegram';

interface SwipeCardProps {
  tweet: SwipeTweet;
  onConfirm: () => void;
  onSkip: () => void;
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

export function SwipeCard({ tweet, onConfirm, onSkip, active }: SwipeCardProps) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 0, 200], [-10, 0, 10]);
  const cardOpacity = useTransform(x, [-SWIPE_EXIT, -200, 0, 200, SWIPE_EXIT], [0, 1, 1, 1, 0]);

  // Glow overlays
  const confirmGlow = useTransform(x, [0, SWIPE_THRESHOLD * 1.5], [0, 0.25]);
  const skipGlow = useTransform(x, [-SWIPE_THRESHOLD * 1.5, 0], [0.25, 0]);

  // Stamp effects
  const confirmStampOpacity = useTransform(x, [20, SWIPE_THRESHOLD], [0, 1]);
  const confirmStampScale = useTransform(x, [20, SWIPE_THRESHOLD], [0.5, 1]);
  const skipStampOpacity = useTransform(x, [-SWIPE_THRESHOLD, -20], [1, 0]);
  const skipStampScale = useTransform(x, [-SWIPE_THRESHOLD, -20], [1, 0.5]);

  const theme = GROUP_THEME[tweet.group as TweetGroup] ?? FALLBACK_THEME;

  const showTranslation = tweet.translationZh && tweet.language &&
    !['zh', 'zh-cn', 'zh-tw'].includes(tweet.language.toLowerCase());

  function handleDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.x > SWIPE_THRESHOLD) {
      onConfirm();
    } else if (info.offset.x < -SWIPE_THRESHOLD) {
      onSkip();
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

        {/* === Swipe glow overlays === */}
        {active && (
          <>
            <motion.div className="absolute inset-0 z-10 rounded-3xl pointer-events-none bg-emerald-400" style={{ opacity: confirmGlow }} />
            <motion.div className="absolute inset-0 z-10 rounded-3xl pointer-events-none bg-rose-400" style={{ opacity: skipGlow }} />
          </>
        )}

        {/* === Stamp indicators (Tinder LIKE/NOPE style) === */}
        {active && (
          <>
            <motion.div
              className="absolute top-6 left-5 z-20 border-[3px] border-emerald-500 text-emerald-500 px-4 py-1.5 rounded-lg font-black text-xl tracking-wider -rotate-12"
              style={{ opacity: confirmStampOpacity, scale: confirmStampScale }}
            >
              REPLY
            </motion.div>
            <motion.div
              className="absolute top-6 right-5 z-20 border-[3px] border-rose-500 text-rose-500 px-4 py-1.5 rounded-lg font-black text-xl tracking-wider rotate-12"
              style={{ opacity: skipStampOpacity, scale: skipStampScale }}
            >
              NOPE
            </motion.div>
          </>
        )}

        {/* === LAYER 1: Hero header === */}
        <div className={`bg-gradient-to-br ${theme.gradient} px-5 pt-5 pb-4 relative overflow-hidden`}>
          {/* Decorative circles */}
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
                      <span className="w-1 h-1 rounded-full bg-amber-900 animate-pulse" />
                      AI 精选
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="text-right">
              <span className={`text-2xl font-black text-white/90`}>{Math.round(tweet.finalScore)}</span>
              <p className="text-[10px] text-white/60 font-medium uppercase tracking-wider">Score</p>
            </div>
          </div>
        </div>

        {/* === LAYER 2: Content === */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {/* Original text */}
          <p className="text-[16px] leading-[1.7] text-stone-800">{tweet.text}</p>

          {/* Translation */}
          {showTranslation && (
            <div className="border-l-[3px] border-amber-400 pl-3 py-1">
              <p className="text-[13px] leading-relaxed text-stone-500">{tweet.translationZh}</p>
            </div>
          )}

          {/* Engagement */}
          <div className="flex items-center gap-4 text-xs text-stone-400 pt-1">
            <span className="flex items-center gap-1"><span className="text-rose-400">♥</span> {tweet.engagement.likes}</span>
            <span className="flex items-center gap-1"><span className="text-blue-400">💬</span> {tweet.engagement.replies}</span>
            <span className="flex items-center gap-1"><span className="text-emerald-400">↻</span> {tweet.engagement.retweets}</span>
          </div>

          {/* Reason */}
          {tweet.reason && (
            <p className="text-[11px] text-stone-400 leading-relaxed">{tweet.reason}</p>
          )}

          {/* Reply angle */}
          {tweet.replyAngle && (
            <div className="bg-amber-50/80 rounded-xl p-3 border border-amber-100">
              <p className="text-[10px] font-semibold text-amber-600/80 uppercase tracking-wider mb-1">回复切入角度</p>
              <p className="text-[13px] text-stone-700 leading-relaxed">{tweet.replyAngle}</p>
            </div>
          )}
        </div>

        {/* === LAYER 3: Action buttons (Tinder style) === */}
        <div className="px-5 py-4 border-t border-stone-100 bg-gradient-to-t from-stone-50/80 to-white">
          <div className="flex items-center justify-center gap-5">
            {/* Skip button */}
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => { hapticFeedback('medium'); onSkip(); }}
              className="w-14 h-14 rounded-full bg-white border-2 border-rose-200 text-rose-500 flex items-center justify-center shadow-lg shadow-rose-100/50 hover:border-rose-300 hover:shadow-rose-200/50 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </motion.button>

            {/* View original (small) */}
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={(e) => { e.stopPropagation(); openExternalLink(tweet.url); }}
              className="w-10 h-10 rounded-full bg-white border-2 border-blue-200 text-blue-500 flex items-center justify-center shadow-md shadow-blue-100/50 hover:border-blue-300 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
            </motion.button>

            {/* Confirm button */}
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => { hapticFeedback('success'); onConfirm(); }}
              className="w-14 h-14 rounded-full bg-white border-2 border-emerald-200 text-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-100/50 hover:border-emerald-300 hover:shadow-emerald-200/50 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
            </motion.button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
