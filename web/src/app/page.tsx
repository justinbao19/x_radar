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
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">📭</div>
          <h1 className="text-xl font-semibold text-slate-900 mb-2">暂无数据</h1>
          <p className="text-slate-500">{error}</p>
          <p className="text-sm text-slate-400 mt-4">
            请确保 GitHub Actions 已运行并同步数据
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
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
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
          </div>
        ) : filteredTweets.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-4xl mb-4">🔍</div>
            <p className="text-slate-500">没有找到符合条件的推文</p>
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
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedTweet(null)}
        >
          <div 
            className="max-w-2xl w-full max-h-[90vh] overflow-y-auto"
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
      <footer className="max-w-6xl mx-auto px-6 py-8 text-center text-sm text-slate-400">
        Generated by X Radar
      </footer>
    </div>
  );
}
