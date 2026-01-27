'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Header, 
  DatePicker, 
  ViewToggle, 
  CategoryFilter, 
  TweetCard, 
  TweetList,
  AuthAlert,
  StatsBar,
  Pagination,
  SortSelector
} from '@/components';
import { 
  loadManifest, 
  loadDataByDateRange, 
  mergeRadarDataWithMeta, 
  sortTweets,
  filterByCategory,
  filterByLanguage,
  filterAiPicked,
  calculateStats,
  getDateRangePreset,
  getUniqueDates
} from '@/lib/data';
import { Tweet, Manifest, DateRange, ViewMode, CategoryFilter as CategoryFilterType, LanguageFilter, SortOption } from '@/lib/types';

export default function Dashboard() {
  const mainRef = useRef<HTMLElement | null>(null);
  const [frozenHeight, setFrozenHeight] = useState<number | null>(null);
  // State
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [allTweets, setAllTweets] = useState<Tweet[]>([]);
  const [latestRunAt, setLatestRunAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filters
  const [dateRange, setDateRange] = useState<DateRange>(getDateRangePreset('7days'));
  const [viewMode, setViewMode] = useState<ViewMode>('card');
  const [categories, setCategories] = useState<CategoryFilterType[]>(['all']);
  const [showAiPickedOnly, setShowAiPickedOnly] = useState(true);
  const [selectedTweet, setSelectedTweet] = useState<Tweet | null>(null);
  const [languageFilter, setLanguageFilter] = useState<LanguageFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('score');
  const [displayedAllTweets, setDisplayedAllTweets] = useState<Tweet[]>([]);
  const [isSwapping, setIsSwapping] = useState(false);
  const [pendingPageReset, setPendingPageReset] = useState(false);
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Load manifest on mount
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

  // Load data when manifest or date range changes
  useEffect(() => {
    if (!manifest) return;
    
    async function loadData() {
      setLoading(true);
      try {
        const dataList = await loadDataByDateRange(manifest!, dateRange);
        const { tweets, latestRunAt: runAt } = mergeRadarDataWithMeta(dataList);
        setAllTweets(sortTweets(tweets, 'score'));
        setLatestRunAt(runAt);
      } catch (e) {
        setError('加载数据失败');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [manifest, dateRange]);

  // Filter tweets
  const filteredTweets = useMemo(() => {
    const sourceTweets = displayedAllTweets.length > 0 ? displayedAllTweets : allTweets;
    let tweets = sourceTweets;
    
    // Apply category filter
    tweets = filterByCategory(tweets, categories);
    
    // Apply AI picked filter
    if (showAiPickedOnly) {
      tweets = filterAiPicked(tweets);
    }

    // Apply language filter
    tweets = filterByLanguage(tweets, languageFilter);
    
    return tweets;
  }, [allTweets, displayedAllTweets, categories, showAiPickedOnly, languageFilter]);

  // Sort tweets
  const sortedTweets = useMemo(() => {
    return sortTweets(filteredTweets, sortBy);
  }, [filteredTweets, sortBy]);

  // Use latestRunAt for "New" badge - only tweets first seen in the latest run show "New"
  // This ensures when a new run has no new tweets, no "New" badges appear

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [categories, showAiPickedOnly, languageFilter, sortBy]);

  useEffect(() => {
    setPendingPageReset(true);
  }, [dateRange]);

  useEffect(() => {
    if (loading || !pendingPageReset) return;
    setCurrentPage(1);
    setPendingPageReset(false);
  }, [loading, pendingPageReset]);

  // Pagination calculations
  const totalPages = Math.ceil(sortedTweets.length / itemsPerPage);
  const paginatedTweets = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return sortedTweets.slice(start, end);
  }, [sortedTweets, currentPage, itemsPerPage]);

  // Calculate stats
  const stats = useMemo(() => {
    const sourceTweets = displayedAllTweets.length > 0 ? displayedAllTweets : allTweets;
    return calculateStats(sourceTweets);
  }, [displayedAllTweets, allTweets]);

  // Available dates for picker
  const availableDates = useMemo(() => {
    return manifest ? getUniqueDates(manifest) : [];
  }, [manifest]);

  // Last updated time
  const lastUpdated = manifest?.lastUpdated;
  const sourceTweets = displayedAllTweets.length > 0 ? displayedAllTweets : allTweets;
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
      <div className="min-h-screen bg-[#FAF9F7] flex items-center justify-center">
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
    <div className="min-h-screen bg-[#FAF9F7]">
      <Header lastUpdated={lastUpdated} />
      
      {/* Auth Status */}
      {manifest?.authStatus && !manifest.authStatus.valid && (
        <div className="max-w-6xl mx-auto px-6 py-4">
          <AuthAlert status={manifest.authStatus} />
        </div>
      )}
      
      {/* Stats Bar */}
      {stats && (
        <StatsBar 
          stats={stats} 
          showAiPicked={showAiPickedOnly}
          onToggleAiPicked={() => setShowAiPickedOnly(!showAiPickedOnly)}
          languageFilter={languageFilter}
          onLanguageChange={setLanguageFilter}
        />
      )}

      {/* Filters */}
      <div className="max-w-6xl mx-auto px-6 py-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <DatePicker 
            value={dateRange} 
            onChange={setDateRange}
            availableDates={availableDates}
          />
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4 sm:gap-y-2">
            <CategoryFilter 
              value={categories} 
              onChange={setCategories}
              stats={stats}
            />
            <SortSelector
              value={sortBy}
              onChange={setSortBy}
            />
            <ViewToggle 
              value={viewMode} 
              onChange={setViewMode} 
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <main
        ref={mainRef}
        className={`max-w-6xl mx-auto px-6 pb-12 relative transition-opacity duration-200 ${mainOpacity}`}
        style={frozenHeight ? { minHeight: `${frozenHeight}px` } : undefined}
      >
        {isInitialLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-amber-200 border-t-amber-500"></div>
          </div>
        ) : sortedTweets.length === 0 ? (
          <div className="text-center py-20">
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
                    isNew={tweet.fetchedAt === latestRunAt}
                  />
                ))}
              </div>
            ) : (
              <div className="columns-1 lg:columns-2 gap-6">
                {paginatedTweets.map((tweet, index) => (
                  <div key={tweet.url} className="mb-6 break-inside-avoid">
                    <TweetCard 
                      tweet={tweet} 
                      index={(currentPage - 1) * itemsPerPage + index}
                      showComments={true}
                      collapsible={true}
                      isNew={tweet.fetchedAt === latestRunAt}
                    />
                  </div>
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
          <div className="absolute inset-0 bg-[#FAF9F7]/60 backdrop-blur-[1px] flex items-center justify-center rounded-2xl">
            <div className="flex items-center gap-3 px-4 py-2 bg-white/90 border border-stone-200/60 rounded-full shadow-sm">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-amber-200 border-t-amber-500"></div>
              <span className="text-sm text-stone-500">更新中</span>
            </div>
          </div>
        )}
      </main>

      {/* Selected Tweet Modal (for list view) */}
      {selectedTweet && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedTweet(null)}
        >
          <div 
            className="max-w-2xl w-full max-h-[90vh] overflow-y-auto rounded-2xl animate-slide-up"
            onClick={e => e.stopPropagation()}
          >
            <TweetCard 
              tweet={selectedTweet} 
              index={selectedTweet.rank}
              showComments={true}
              isNew={selectedTweet.fetchedAt === latestRunAt}
            />
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="max-w-6xl mx-auto px-6 py-10">
        <div className="border-t border-stone-200/60 pt-8">
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
              <svg className="w-4 h-4 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
