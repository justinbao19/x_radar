'use client';

import { Tweet } from '@/lib/types';
import { formatNumber, formatDateTime } from '@/lib/data';

interface TweetListProps {
  tweets: Tweet[];
  onSelect?: (tweet: Tweet) => void;
}

export function TweetList({ tweets, onSelect }: TweetListProps) {
  return (
    <div className="bg-white rounded-2xl border border-stone-200/80 overflow-hidden shadow-sm">
      <table className="w-full">
        <thead className="bg-gradient-to-r from-stone-50 to-stone-100/50 border-b border-stone-200/80">
          <tr>
            <th className="px-4 py-3.5 text-left text-xs font-semibold text-stone-500 uppercase tracking-wider">#</th>
            <th className="px-4 py-3.5 text-left text-xs font-semibold text-stone-500 uppercase tracking-wider">作者</th>
            <th className="px-4 py-3.5 text-left text-xs font-semibold text-stone-500 uppercase tracking-wider">内容</th>
            <th className="px-4 py-3.5 text-left text-xs font-semibold text-stone-500 uppercase tracking-wider">分类</th>
            <th className="px-4 py-3.5 text-right text-xs font-semibold text-stone-500 uppercase tracking-wider">互动</th>
            <th className="px-4 py-3.5 text-right text-xs font-semibold text-stone-500 uppercase tracking-wider">评分</th>
            <th className="px-4 py-3.5 text-center text-xs font-semibold text-stone-500 uppercase tracking-wider">状态</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {tweets.map((tweet) => {
            const groupColor = tweet.group === 'pain' 
              ? 'bg-rose-50 text-rose-700 border border-rose-200/50' 
              : tweet.originalGroup === 'kol'
                ? 'bg-purple-50 text-purple-700 border border-purple-200/50'
                : 'bg-sky-50 text-sky-700 border border-sky-200/50';
            const groupLabel = tweet.originalGroup === 'kol' ? 'KOL' : tweet.group.toUpperCase();
            
            return (
              <tr 
                key={tweet.url}
                onClick={() => onSelect?.(tweet)}
                className="hover:bg-amber-50/30 cursor-pointer transition-colors duration-150"
              >
                <td className="px-4 py-3.5">
                  <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-stone-800 to-stone-900 text-white text-xs font-bold flex items-center justify-center shadow-sm">
                    {tweet.rank}
                  </span>
                </td>
                <td className="px-4 py-3.5">
                  <a 
                    href={`https://x.com/${tweet.author?.replace('@', '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-stone-800 hover:text-amber-600 transition-colors"
                    onClick={e => e.stopPropagation()}
                  >
                    {tweet.author}
                  </a>
                </td>
                <td className="px-4 py-3.5 max-w-md">
                  <p className="text-sm text-stone-600 truncate">
                    {tweet.text?.slice(0, 100)}...
                  </p>
                </td>
                <td className="px-4 py-3.5">
                  <span className={`text-xs font-semibold px-2 py-1 rounded-md ${groupColor}`}>
                    {groupLabel}
                  </span>
                </td>
                <td className="px-4 py-3.5 text-right">
                  <div className="flex items-center justify-end gap-3 text-xs text-stone-500">
                    <span className="flex items-center gap-1">
                      <svg className="w-3.5 h-3.5 text-rose-400" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                      </svg>
                      {formatNumber(tweet.likes)}
                    </span>
                    <span className="flex items-center gap-1">
                      <svg className="w-3.5 h-3.5 text-emerald-400" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M23.77 15.67c-.292-.293-.767-.293-1.06 0l-2.22 2.22V7.65c0-2.068-1.683-3.75-3.75-3.75h-5.85c-.414 0-.75.336-.75.75s.336.75.75.75h5.85c1.24 0 2.25 1.01 2.25 2.25v10.24l-2.22-2.22c-.293-.293-.768-.293-1.06 0s-.294.768 0 1.06l3.5 3.5c.145.147.337.22.53.22s.383-.072.53-.22l3.5-3.5c.294-.292.294-.767 0-1.06zm-10.66 3.28H7.26c-1.24 0-2.25-1.01-2.25-2.25V6.46l2.22 2.22c.148.147.34.22.532.22s.384-.073.53-.22c.293-.293.293-.768 0-1.06l-3.5-3.5c-.293-.294-.768-.294-1.06 0l-3.5 3.5c-.294.292-.294.767 0 1.06s.767.293 1.06 0l2.22-2.22V16.7c0 2.068 1.683 3.75 3.75 3.75h5.85c.414 0 .75-.336.75-.75s-.337-.75-.75-.75z"/>
                      </svg>
                      {formatNumber(tweet.retweets)}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3.5 text-right">
                  <span className="font-bold text-stone-800">
                    {formatNumber(tweet.finalScore)}
                  </span>
                </td>
                <td className="px-4 py-3.5 text-center">
                  {tweet.comments ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200/50">
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      已生成
                    </span>
                  ) : tweet.commentSkipped ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200/50">
                      跳过
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 px-2.5 py-1 rounded-md border border-red-200/50">
                      失败
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
