'use client';

import { useState, useEffect, useMemo } from 'react';
import { 
  Header, 
  DatePicker, 
  ViewToggle, 
  CategoryFilter, 
  TweetCard, 
  TweetList,
  AuthAlert,
  StatsBar,
  Pagination
} from '@/components';
import { 
  loadManifest, 
  loadDataByDateRange, 
  mergeRadarData, 
  sortTweets,
  filterByCategory,
  filterAiPicked,
  calculateStats,
  getDateRangePreset,
  getUniqueDates
} from '@/lib/data';
import { Tweet, Manifest, DateRange, ViewMode, CategoryFilter as CategoryFilterType } from '@/lib/types';

export default function Dashboard() {
  // State
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [allTweets, setAllTweets] = useState<Tweet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filters
  const [dateRange, setDateRange] = useState<DateRange>(getDateRangePreset('7days'));
  const [viewMode, setViewMode] = useState<ViewMode>('card');
  const [categories, setCategories] = useState<CategoryFilterType[]>(['all']);
  const [showAiPickedOnly, setShowAiPickedOnly] = useState(true);
  const [selectedTweet, setSelectedTweet] = useState<Tweet | null>(null);
  
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
        const tweets = mergeRadarData(dataList);
        setAllTweets(sortTweets(tweets, 'score'));
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
    let tweets = allTweets;
    
    // Apply category filter
    tweets = filterByCategory(tweets, categories);
    
    // Apply AI picked filter
    if (showAiPickedOnly) {
      tweets = filterAiPicked(tweets);
    }
    
    return tweets;
  }, [allTweets, categories, showAiPickedOnly]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [categories, showAiPickedOnly, dateRange]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredTweets.length / itemsPerPage);
  const paginatedTweets = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return filteredTweets.slice(start, end);
  }, [filteredTweets, currentPage, itemsPerPage]);

  // Calculate stats
  const stats = useMemo(() => {
    return calculateStats(allTweets);
  }, [allTweets]);

  // Available dates for picker
  const availableDates = useMemo(() => {
    return manifest ? getUniqueDates(manifest) : [];
  }, [manifest]);

  // Last updated time
  const lastUpdated = manifest?.lastUpdated;

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
          <div className="flex items-center gap-4">
            <CategoryFilter 
              value={categories} 
              onChange={setCategories}
              stats={stats}
            />
            <ViewToggle 
              value={viewMode} 
              onChange={setViewMode} 
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-6 pb-12">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-amber-200 border-t-amber-500"></div>
          </div>
        ) : filteredTweets.length === 0 ? (
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
                totalItems={filteredTweets.length}
                itemsPerPage={itemsPerPage}
              />
            </div>
          </>
        ) : (
          <>
            <div className={`grid gap-6 ${
              viewMode === 'timeline' ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2'
            }`}>
              {paginatedTweets.map((tweet, index) => (
                <TweetCard 
                  key={tweet.url} 
                  tweet={tweet} 
                  index={(currentPage - 1) * itemsPerPage + index}
                  showComments={viewMode !== 'timeline'}
                  collapsible={viewMode === 'timeline'}
                />
              ))}
            </div>
            <div className="mt-6">
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                totalItems={filteredTweets.length}
                itemsPerPage={itemsPerPage}
              />
            </div>
          </>
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
