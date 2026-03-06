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

const GROUP_STYLES: Record<TweetGroup, { border: string; bg: string }> = {
  sentiment: { border: 'border-blue-400', bg: 'bg-blue-50' },
  pain: { border: 'border-rose-400', bg: 'bg-rose-50' },
  insight: { border: 'border-purple-400', bg: 'bg-purple-50' },
  reach: { border: 'border-emerald-400', bg: 'bg-emerald-50' },
};

const SWIPE_THRESHOLD = 100;

export function SwipeCard({ tweet, onConfirm, onSkip, active }: SwipeCardProps) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 0, 200], [-12, 0, 12]);
  const opacity = useTransform(x, [-300, -100, 0, 100, 300], [0.3, 1, 1, 1, 0.3]);

  const confirmOpacity = useTransform(x, [0, SWIPE_THRESHOLD], [0, 1]);
  const skipOpacity = useTransform(x, [-SWIPE_THRESHOLD, 0], [1, 0]);

  const groupStyle = GROUP_STYLES[tweet.group as TweetGroup] ?? {
    border: 'border-stone-300',
    bg: 'bg-stone-50',
  };

  const showTranslation =
    tweet.translationZh && tweet.language && !['zh', 'zh-cn', 'zh-tw', 'en'].includes(tweet.language);

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
      dragElastic={0.8}
      onDragEnd={handleDragEnd}
      animate={active ? { scale: 1, y: 0 } : { scale: 0.95, y: 8 }}
      exit={{ x: 300, opacity: 0, transition: { duration: 0.3 } }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
    >
      <div
        className={`h-full rounded-2xl border-2 ${groupStyle.border} bg-white shadow-xl overflow-hidden flex flex-col`}
      >
        {/* Swipe indicators */}
        <motion.div
          className="absolute top-6 right-6 z-20 bg-emerald-500 text-white px-4 py-2 rounded-xl font-bold text-lg shadow-lg -rotate-12"
          style={{ opacity: confirmOpacity }}
        >
          REPLY
        </motion.div>
        <motion.div
          className="absolute top-6 left-6 z-20 bg-rose-500 text-white px-4 py-2 rounded-xl font-bold text-lg shadow-lg rotate-12"
          style={{ opacity: skipOpacity }}
        >
          SKIP
        </motion.div>

        {/* Card content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Author + Group */}
          <div className="flex items-center justify-between">
            <span className="text-base font-semibold text-stone-800">{tweet.author}</span>
            <GroupBadge group={tweet.group} />
          </div>

          {/* Original text */}
          <p className="text-[15px] leading-relaxed text-stone-800">{tweet.text}</p>

          {/* Translation */}
          {showTranslation && (
            <div className={`${groupStyle.bg} rounded-xl p-3`}>
              <p className="text-sm text-stone-600 leading-relaxed">{tweet.translationZh}</p>
            </div>
          )}

          {/* Engagement */}
          <EngagementBadge
            likes={tweet.engagement.likes}
            replies={tweet.engagement.replies}
            retweets={tweet.engagement.retweets}
          />

          {/* Score + Reason */}
          <div className="flex items-center gap-2 text-sm text-stone-500">
            <span className="font-medium">Score: {Math.round(tweet.finalScore)}</span>
            {tweet.aiPicked && (
              <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full text-xs font-medium">
                AI 精选
              </span>
            )}
          </div>
          {tweet.reason && (
            <p className="text-xs text-stone-400">{tweet.reason}</p>
          )}

          {/* View original */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              openExternalLink(tweet.url);
            }}
            className="text-sm text-blue-500 hover:text-blue-600 font-medium"
          >
            🔗 查看原文
          </button>

          {/* Reply angle */}
          {tweet.replyAngle && (
            <div className="bg-stone-50 rounded-xl p-3">
              <p className="text-xs text-stone-400 mb-1">回复角度</p>
              <p className="text-sm text-stone-600">{tweet.replyAngle}</p>
            </div>
          )}
        </div>

        {/* Bottom buttons */}
        <div className="p-4 border-t border-stone-100 flex gap-3">
          <button
            onClick={() => {
              hapticFeedback('medium');
              onSkip();
            }}
            className="flex-1 py-3 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-600 font-medium text-sm transition-colors active:scale-95"
          >
            ❌ 跳过
          </button>
          <button
            onClick={() => {
              hapticFeedback('success');
              onConfirm();
            }}
            className="flex-1 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-medium text-sm transition-colors active:scale-95"
          >
            ✅ 回复
          </button>
        </div>
      </div>
    </motion.div>
  );
}
