'use client';

import { useTweetVote } from '@/lib/VoteContext';

interface VoteButtonsProps {
  tweetUrl: string;
  tweetText?: string;
  tweetGroup?: string;
  sourceQuery?: string;
}

export function VoteButtons({ tweetUrl, tweetText, tweetGroup, sourceQuery }: VoteButtonsProps) {
  const { currentVote, handleVote, isConfigured, isLoading } = useTweetVote(tweetUrl);

  if (!isConfigured) {
    return null; // Don't show buttons if Supabase is not configured
  }

  const handleUpvote = () => {
    handleVote('up', { text: tweetText, group: tweetGroup, sourceQuery });
  };

  const handleDownvote = () => {
    handleVote('down', { text: tweetText, group: tweetGroup, sourceQuery });
  };

  return (
    <div className="flex items-center gap-1">
      {/* Upvote Button */}
      <button
        onClick={handleUpvote}
        disabled={isLoading}
        className={`group flex items-center gap-1 px-2 py-1.5 rounded-lg transition-all duration-200 ${
          currentVote === 'up'
            ? 'bg-emerald-100 text-emerald-700 border border-emerald-300'
            : 'text-stone-400 hover:text-emerald-600 hover:bg-emerald-50 border border-transparent hover:border-emerald-200'
        } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
        title={currentVote === 'up' ? '取消正确标记' : '标记为正确收录'}
        aria-label={currentVote === 'up' ? '取消正确标记' : '标记为正确收录'}
      >
        <svg 
          className={`w-4 h-4 transition-transform duration-200 ${currentVote === 'up' ? 'scale-110' : 'group-hover:scale-110'}`} 
          fill={currentVote === 'up' ? 'currentColor' : 'none'} 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={2} 
            d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" 
          />
        </svg>
        {currentVote === 'up' && (
          <span className="text-xs font-medium">正确</span>
        )}
      </button>

      {/* Downvote Button */}
      <button
        onClick={handleDownvote}
        disabled={isLoading}
        className={`group flex items-center gap-1 px-2 py-1.5 rounded-lg transition-all duration-200 ${
          currentVote === 'down'
            ? 'bg-red-100 text-red-700 border border-red-300'
            : 'text-stone-400 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200'
        } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
        title={currentVote === 'down' ? '取消错误标记' : '标记为错误收录'}
        aria-label={currentVote === 'down' ? '取消错误标记' : '标记为错误收录'}
      >
        <svg 
          className={`w-4 h-4 transition-transform duration-200 ${currentVote === 'down' ? 'scale-110' : 'group-hover:scale-110'}`} 
          fill={currentVote === 'down' ? 'currentColor' : 'none'} 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={2} 
            d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018a2 2 0 01.485.06l3.76.94m-7 10v5a2 2 0 002 2h.096c.5 0 .905-.405.905-.904 0-.715.211-1.413.608-2.008L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5" 
          />
        </svg>
        {currentVote === 'down' && (
          <span className="text-xs font-medium">错误</span>
        )}
      </button>
    </div>
  );
}
