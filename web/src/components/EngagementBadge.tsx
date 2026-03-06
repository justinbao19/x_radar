'use client';

interface EngagementBadgeProps {
  likes: number;
  replies: number;
  retweets: number;
}

export function EngagementBadge({ likes, replies, retweets }: EngagementBadgeProps) {
  return (
    <div className="flex items-center gap-4 text-sm text-stone-500">
      <span className="flex items-center gap-1">
        <span>❤️</span>
        <span>{likes}</span>
      </span>
      <span className="flex items-center gap-1">
        <span>💬</span>
        <span>{replies}</span>
      </span>
      <span className="flex items-center gap-1">
        <span>🔁</span>
        <span>{retweets}</span>
      </span>
    </div>
  );
}
