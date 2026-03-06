'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Header, 
  RadarSelector,
  DatePicker, 
  ViewToggle, 
  CategoryFilter, 
  TweetCard, 
  TweetList,
  AuthAlert,
  StatsBar,
  Pagination,
  SortSelector,
  LanguageFilter,
  FeedbackModal
} from '@/components';
import { 
  loadManifest, 
  loadDataByRunCount, 
  mergeRadarDataWithMeta, 
  sortTweets,
  filterByCategory,
  filterByLanguage,
  filterAiPicked,
  calculateStats,
  isTweetNew
} from '@/lib/data';
import { useVotes } from '@/lib/VoteContext';
import { Tweet, Manifest, RunCountPreset, ViewMode, CategoryFilter as CategoryFilterType, LanguageFilter as LanguageFilterType, SortOption, RadarCategory, PainRadarFilter } from '@/lib/types';

function TweetModal({ tweet, recentRunAts, onClose }: { tweet: Tweet; recentRunAts: string[]; onClose: () => void }) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div 
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div 
        className="relative max-w-2xl w-full max-h-[90vh] overflow-y-auto rounded-2xl animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-stone-100/90 hover:bg-stone-200 text-stone-500 hover:text-stone-700 transition-colors shadow-sm"
          aria-label="关闭"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <TweetCard 
          tweet={tweet} 
          index={tweet.rank}
          showComments={true}
          isNew={isTweetNew(tweet, recentRunAts)}
        />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const mainRef = useRef<HTMLElement | null>(null);
  const [frozenHeight, setFrozenHeight] = useState<number | null>(null);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [allTweets, setAllTweets] = useState<Tweet[]>([]);
  const [recentRunAts, setRecentRunAts] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const { hiddenUrls, feedbackModal, confirmDownvote, cancelDownvote } = useVotes();
  
  const [radarCategory, setRadarCategory] = useState<RadarCategory>('pain_radar');
  
  const [timePreset, setTimePreset] = useState<RunCountPreset>('today');
  const [viewMode, setViewMode] = useState<ViewMode>('card');
  const [selectedTweet, setSelectedTweet] = useState<Tweet | null>(null);
  const [displayedAllTweets, setDisplayedAllTweets] = useState<Tweet[]>([]);
  const [isSwapping, setIsSwapping] = useState(false);
  const [pendingPageReset, setPendingPageReset] = useState(false);
  
  const [radarStates, setRadarStates] = useState<Record<RadarCategory, {
    categories: CategoryFilterType[];
    languageFilter: LanguageFilterType;
    sortBy: SortOption;
    currentPage: number;
    showAiPickedOnly: boolean;
  }>>({
    pain_radar: { categories: ['new'], languageFilter: 'all', sortBy: 'score', currentPage: 1, showAiPickedOnly: true },
    filo_sentiment: { categories: ['new'], languageFilter: 'all', sortBy: 'score', currentPage: 1, showAiPickedOnly: true },
    user_insight: { categories: ['new'], languageFilter: 'all', sortBy: 'score', currentPage: 1, showAiPickedOnly: true },
  });
  
  const currentState = radarStates[radarCategory];
  const categories = currentState.categories;
  const languageFilter = currentState.languageFilter;
  const sortBy = currentState.sortBy;
  const currentPage = currentState.currentPage;
  const showAiPickedOnly = currentState.showAiPickedOnly;
  
  const setCategories = (newCategories: CategoryFilterType[]) => {
    setRadarStates(prev => ({
      ...prev,
      [radarCategory]: { ...prev[radarCategory], categories: newCategories, currentPage: 1 }
    }));
  };
  const setLanguageFilter = (newFilter: LanguageFilterType) => {
    setRadarStates(prev => ({
      ...prev,
      [radarCategory]: { ...prev[radarCategory], languageFilter: newFilter, currentPage: 1 }
    }));
  };
  const setSortBy = (newSort: SortOption) => {
    setRadarStates(prev => ({
      ...prev,
      [radarCategory]: { ...prev[radarCategory], sortBy: newSort, currentPage: 1 }
    }));
  };
  const setCurrentPage = (newPage: number) => {
    setRadarStates(prev => ({
      ...prev,
      [radarCategory]: { ...prev[radarCategory], currentPage: newPage }
    }));
  };
  const setShowAiPickedOnly = (newValue: boolean) => {
    setRadarStates(prev => ({
      ...prev,
      [radarCategory]: { ...prev[radarCategory], showAiPickedOnly: newValue, currentPage: 1 }
    }));
  };
  
  const itemsPerPage = 10;

  useEffect(() => {
    async function init() {
      try {
        const m = await loadManifest();
        if (m) {
          setManifest(m);
        } else {
          setError('无法加载数据清单');
        }
      } catch (e) {
        setError('加载失败');
      }
    }
    init();
  }, []);

  useEffect(() => {
    if (!manifest) return;
    
    async function loadData() {
      setLoading(true);
      try {
        const dataList = await loadDataByRunCount(manifest!, timePreset);
        const { tweets, recentRunAts: runs } = mergeRadarDataWithMeta(dataList);
        setAllTweets(sortTweets(tweets, 'score'));
        setRecentRunAts(runs);
      } catch (e) {
        setError('加载数据失败');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [manifest, timePreset]);

  const sourceTweets = useMemo(() => {
    const base = displayedAllTweets.length > 0 ? displayedAllTweets : allTweets;
    return base.filter(tweet => !hiddenUrls.has(tweet.url));
  }, [allTweets, displayedAllTweets, hiddenUrls]);

  const allRadarFilteredTweets = useMemo(() => {
    return {
      pain_radar: sourceTweets.filter(t => 
        t.group === 'pain' || t.group === 'reach' || t.originalGroup === 'kol'
      ),
      filo_sentiment: sourceTweets.filter(t => t.group === 'sentiment'),
      user_insight: sourceTweets.filter(t => t.group === 'insight')
    };
  }, [sourceTweets]);

  const radarFilteredTweets = useMemo(() => {
    return allRadarFilteredTweets[radarCategory] || sourceTweets;
  }, [allRadarFilteredTweets, radarCategory, sourceTweets]);
  
  const filteredTweets = useMemo(() => {
    let tweets = radarFilteredTweets;
    
    if (radarCategory === 'pain_radar') {
      tweets = filterByCategory(tweets, categories as PainRadarFilter[], recentRunAts);
      if (showAiPickedOnly) {
        tweets = filterAiPicked(tweets);
      }
    } else if (radarCategory === 'filo_sentiment') {
      if (!categories.includes('all')) {
        tweets = tweets.filter(t => {
          if (categories.includes('new') && isTweetNew(t, recentRunAts)) return true;
          if (categories.includes('positive') && t.sentimentLabel === 'positive') return true;
          if (categories.includes('negative') && t.sentimentLabel === 'negative') return true;
          if (categories.includes('neutral') && t.sentimentLabel === 'neutral') return true;
          return false;
        });
      }
    } else if (radarCategory === 'user_insight') {
      if (!categories.includes('all')) {
        tweets = tweets.filter(t => {
          if (categories.includes('new') && isTweetNew(t, recentRunAts)) return true;
          if (categories.includes('feature_request') && t.insightType === 'feature_request') return true;
          if (categories.includes('competitor_praise') && t.insightType === 'competitor_praise') return true;
          if (categories.includes('ai_demand') && t.insightType === 'ai_demand') return true;
          return false;
        });
      }
    }

    tweets = filterByLanguage(tweets, languageFilter);
    
    return tweets;
  }, [radarFilteredTweets, radarCategory, categories, showAiPickedOnly, languageFilter, recentRunAts]);

  const sortedTweets = useMemo(() => {
    return sortTweets(filteredTweets, sortBy);
  }, [filteredTweets, sortBy]);

  useEffect(() => {
    setPendingPageReset(true);
  }, [timePreset]);

  useEffect(() => {
    if (loading || !pendingPageReset) return;
    setCurrentPage(1);
    setPendingPageReset(false);
  }, [loading, pendingPageReset]);

  const totalPages = Math.ceil(sortedTweets.length / itemsPerPage);
  const paginatedTweets = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return sortedTweets.slice(start, end);
  }, [sortedTweets, currentPage, itemsPerPage]);

  const stats = useMemo(() => {
    return calculateStats(radarFilteredTweets, recentRunAts);
  }, [radarFilteredTweets, recentRunAts]);
  
  const radarCounts = useMemo(() => {
    return {
      pain_radar: allRadarFilteredTweets.pain_radar.length,
      filo_sentiment: allRadarFilteredTweets.filo_sentiment.length,
      user_insight: allRadarFilteredTweets.user_insight.length
    };
  }, [allRadarFilteredTweets]);

  const languageStats = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const tweet of radarFilteredTweets) {
      const lang = (tweet.detectedLanguage || 'unknown').toLowerCase();
      counts[lang] = (counts[lang] || 0) + 1;
    }
    return counts;
  }, [radarFilteredTweets]);

  const lastUpdated = manifest?.lastUpdated;
  const isInitialLoading = loading && sourceTweets.length === 0;
  const showRefreshOverlay = loading && sourceTweets.length > 0;
  const mainOpacity = showRefreshOverlay || isSwapping ? 'opacity-70' : 'opacity-100';

  useEffect(() => {
    if (loading) return;
    if (allTweets.length === 0) {
      setDisplayedAllTweets([]);
      return;
    }
    if (displayedAllTweets.length === 0) {
      setDisplayedAllTweets(allTweets);
      return;
    }
    setIsSwapping(true);
    const swapTimer = window.setTimeout(() => {
      setDisplayedAllTweets(allTweets);
      requestAnimationFrame(() => setIsSwapping(false));
    }, 120);
    return () => window.clearTimeout(swapTimer);
  }, [allTweets, loading, displayedAllTweets.length]);

  useEffect(() => {
    if (!showRefreshOverlay) {
      setFrozenHeight(null);
      return;
    }
    const height = mainRef.current?.offsetHeight ?? null;
    if (height && height > 0) {
      setFrozenHeight(height);
    }
  }, [showRefreshOverlay]);

  if (error && !manifest) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">📭</div>
          <h1 className="text-xl font-semibold text-stone-800 mb-2">暂无数据</h1>
          <p className="text-stone-500">{error}</p>
          <p className="text-sm text-stone-400 mt-4">
            请确保 GitHub Actions 已运行并同步数据
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header lastUpdated={lastUpdated} />
      
      <RadarSelector 
        selected={radarCategory}
        onChange={setRadarCategory}
        counts={radarCounts}
      />
      
      {manifest?.authStatus && !manifest.authStatus.valid && (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
          <AuthAlert status={manifest.authStatus} />
        </div>
      )}
      
      {stats && (
        <StatsBar 
          stats={stats} 
          showAiPicked={showAiPickedOnly}
          onToggleAiPicked={() => setShowAiPickedOnly(!showAiPickedOnly)}
          radarCategory={radarCategory}
          filteredCount={sortedTweets.length}
        />
      )}

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 sm:py-4 relative z-30">
        <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto scrollbar-hide sm:overflow-visible sm:flex-wrap">
          <DatePicker 
            value={timePreset} 
            onChange={setTimePreset}
          />
          <CategoryFilter 
            value={categories} 
            onChange={setCategories}
            stats={stats}
            radarCategory={radarCategory}
            radarFilteredTweets={radarFilteredTweets}
            recentRunAts={recentRunAts}
          />
          <LanguageFilter
            value={languageFilter}
            onChange={setLanguageFilter}
            stats={languageStats}
          />
          <SortSelector
            value={sortBy}
            onChange={setSortBy}
          />
          <div className="hidden sm:block w-px h-5 bg-stone-200 mx-1 shrink-0" />
          <ViewToggle 
            value={viewMode} 
            onChange={setViewMode} 
          />
        </div>
      </div>

      <main
        ref={mainRef}
        className={`max-w-6xl mx-auto px-4 sm:px-6 pb-12 relative transition-opacity duration-200 flex-1 w-full ${mainOpacity}`}
        style={frozenHeight ? { minHeight: `${frozenHeight}px` } : undefined}
      >
        {isInitialLoading ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-stone-200/80 overflow-hidden animate-pulse">
                <div className="p-6 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-full bg-stone-200" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-stone-200 rounded w-28" />
                      <div className="flex gap-2">
                        <div className="h-5 bg-stone-100 rounded-full w-14" />
                        <div className="h-5 bg-stone-100 rounded-full w-16" />
                      </div>
                    </div>
                    <div className="w-16 h-12 bg-stone-100 rounded-xl" />
                  </div>
                </div>
                <div className="px-6 pb-4 space-y-3">
                  <div className="bg-stone-50 rounded-xl p-4 space-y-2">
                    <div className="h-3 bg-stone-200 rounded w-full" />
                    <div className="h-3 bg-stone-200 rounded w-4/5" />
                    <div className="h-3 bg-stone-200 rounded w-3/5" />
                  </div>
                  <div className="flex gap-4 pt-2">
                    <div className="h-4 bg-stone-100 rounded w-12" />
                    <div className="h-4 bg-stone-100 rounded w-12" />
                    <div className="h-4 bg-stone-100 rounded w-12" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : sortedTweets.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[40vh]">
            <div className="text-5xl mb-4">🔍</div>
            <p className="text-stone-500 text-lg">没有找到符合条件的推文</p>
            <p className="text-stone-400 text-sm mt-2">尝试调整筛选条件</p>
          </div>
        ) : viewMode === 'list' ? (
          <>
            <TweetList 
              tweets={paginatedTweets} 
              onSelect={setSelectedTweet}
            />
            <div className="mt-6">
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                totalItems={sortedTweets.length}
                itemsPerPage={itemsPerPage}
              />
            </div>
          </>
        ) : (
          <>
            {viewMode === 'timeline' ? (
              <div className="grid gap-6 grid-cols-1">
                {paginatedTweets.map((tweet, index) => (
                  <TweetCard 
                    key={tweet.url} 
                    tweet={tweet} 
                    index={(currentPage - 1) * itemsPerPage + index}
                    showComments={false}
                    collapsible={true}
                    isNew={isTweetNew(tweet, recentRunAts)}
                  />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                {paginatedTweets.map((tweet, index) => (
                  <TweetCard 
                    key={tweet.url}
                    tweet={tweet} 
                    index={(currentPage - 1) * itemsPerPage + index}
                    showComments={true}
                    collapsible={true}
                    isNew={isTweetNew(tweet, recentRunAts)}
                  />
                ))}
              </div>
            )}
            <div className="mt-6">
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                totalItems={sortedTweets.length}
                itemsPerPage={itemsPerPage}
              />
            </div>
          </>
        )}
        {showRefreshOverlay && (
          <div className="absolute inset-0 bg-background/60 backdrop-blur-[1px] flex items-center justify-center rounded-2xl">
            <div className="flex items-center gap-3 px-4 py-2 bg-white/90 border border-stone-200/60 rounded-full shadow-sm">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-amber-200 border-t-amber-500"></div>
              <span className="text-sm text-stone-500">更新中</span>
            </div>
          </div>
        )}
      </main>

      {selectedTweet && (
        <TweetModal
          tweet={selectedTweet}
          recentRunAts={recentRunAts}
          onClose={() => setSelectedTweet(null)}
        />
      )}

      <FeedbackModal
        isOpen={feedbackModal.isOpen}
        onClose={cancelDownvote}
        onSubmit={confirmDownvote}
        tweetText={feedbackModal.tweetText}
      />

      <footer className="max-w-6xl mx-auto px-4 sm:px-6 py-6 mt-auto w-full">
        <div className="border-t border-stone-200/60 pt-6">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 text-sm text-stone-400">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-amber-500" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L9.19 8.63L2 9.24L7.46 13.97L5.82 21L12 17.27L18.18 21L16.54 13.97L22 9.24L14.81 8.63L12 2Z"/>
              </svg>
              <span>Generated by <span className="font-semibold text-stone-600">X Radar</span></span>
            </div>
            <span className="hidden sm:inline text-stone-300">•</span>
            <a 
              href="https://x.com/JustinBao_" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-stone-500 hover:text-amber-600 transition-colors group"
            >
              <span>Built by</span>
              <span className="font-medium text-stone-600 group-hover:text-amber-600">@JustinBao_</span>
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
