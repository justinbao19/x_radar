'use client';

import { Tweet } from '@/lib/types';
import { formatNumber, formatDateTime } from '@/lib/data';

interface TweetListProps {
  tweets: Tweet[];
  onSelect?: (tweet: Tweet) => void;
}

export function TweetList({ tweets, onSelect }: TweetListProps) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <table className="w-full">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">#</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">作者</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">内容</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">分类</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">互动</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">评分</th>
            <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">状态</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {tweets.map((tweet) => {
            const groupColor = tweet.group === 'pain' 
              ? 'bg-pink-100 text-pink-700' 
              : 'bg-blue-100 text-blue-700';
            const groupLabel = tweet.originalGroup === 'kol' ? 'KOL' : tweet.group.toUpperCase();
            
            return (
              <tr 
                key={tweet.url}
                onClick={() => onSelect?.(tweet)}
                className="hover:bg-slate-50 cursor-pointer transition-colors"
              >
                <td className="px-4 py-3">
                  <span className="w-6 h-6 rounded bg-slate-900 text-white text-xs font-bold flex items-center justify-center">
                    {tweet.rank}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <a 
                    href={`https://x.com/${tweet.author?.replace('@', '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-slate-900 hover:text-blue-600"
                    onClick={e => e.stopPropagation()}
                  >
                    {tweet.author}
                  </a>
                </td>
                <td className="px-4 py-3 max-w-md">
                  <p className="text-sm text-slate-600 truncate">
                    {tweet.text?.slice(0, 100)}...
                  </p>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded ${groupColor}`}>
                    {groupLabel}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-3 text-xs text-slate-500">
                    <span>❤️ {formatNumber(tweet.likes)}</span>
                    <span>🔁 {formatNumber(tweet.retweets)}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="font-semibold text-slate-900">
                    {formatNumber(tweet.finalScore)}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  {tweet.comments ? (
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      已生成
                    </span>
                  ) : tweet.commentSkipped ? (
                    <span className="inline-flex items-center gap-1 text-xs text-amber-600 bg-amber-100 px-2 py-0.5 rounded">
                      跳过
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-red-600 bg-red-100 px-2 py-0.5 rounded">
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
