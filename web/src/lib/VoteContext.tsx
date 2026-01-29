'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { submitVote, removeVote, getAllVotes, getVoteStats, isSupabaseConfigured } from './supabase';

// ============ Types ============

interface TweetMeta {
  text?: string;
  group?: string;
  sourceQuery?: string;
}

interface VoteContextValue {
  // Vote state
  votes: Map<string, 'up' | 'down'>;
  
  // Statistics
  stats: { upvotes: number; downvotes: number; total: number };
  
  // Loading state
  isLoading: boolean;
  isConfigured: boolean;
  
  // Actions
  vote: (url: string, type: 'up' | 'down', meta?: TweetMeta) => Promise<void>;
  unvote: (url: string) => Promise<void>;
  getVote: (url: string) => 'up' | 'down' | null;
  refreshStats: () => Promise<void>;
}

// ============ Context ============

const VoteContext = createContext<VoteContextValue | null>(null);

// ============ Provider ============

interface VoteProviderProps {
  children: ReactNode;
}

export function VoteProvider({ children }: VoteProviderProps) {
  const [votes, setVotes] = useState<Map<string, 'up' | 'down'>>(new Map());
  const [stats, setStats] = useState({ upvotes: 0, downvotes: 0, total: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const isConfigured = isSupabaseConfigured();

  // Load initial votes on mount
  useEffect(() => {
    async function loadVotes() {
      if (!isConfigured) {
        setIsLoading(false);
        return;
      }

      try {
        const [votesData, statsData] = await Promise.all([
          getAllVotes(),
          getVoteStats()
        ]);
        setVotes(votesData);
        setStats(statsData);
      } catch (err) {
        console.error('Failed to load votes:', err);
      } finally {
        setIsLoading(false);
      }
    }

    loadVotes();
  }, [isConfigured]);

  // Vote action with optimistic update
  const vote = useCallback(async (url: string, type: 'up' | 'down', meta?: TweetMeta) => {
    if (!isConfigured) return;

    // Optimistic update
    const previousVote = votes.get(url);
    setVotes(prev => {
      const newMap = new Map(prev);
      newMap.set(url, type);
      return newMap;
    });

    // Update stats optimistically
    setStats(prev => {
      const newStats = { ...prev };
      // Remove previous vote from stats
      if (previousVote === 'up') newStats.upvotes--;
      if (previousVote === 'down') newStats.downvotes--;
      // Add new vote to stats
      if (type === 'up') newStats.upvotes++;
      if (type === 'down') newStats.downvotes++;
      // Update total only if this is a new vote
      if (!previousVote) newStats.total++;
      return newStats;
    });

    // Sync to Supabase
    const result = await submitVote({
      tweetUrl: url,
      voteType: type,
      tweetText: meta?.text,
      tweetGroup: meta?.group,
      sourceQuery: meta?.sourceQuery
    });

    // Rollback on failure
    if (!result.success) {
      console.error('Vote failed, rolling back:', result.error);
      setVotes(prev => {
        const newMap = new Map(prev);
        if (previousVote) {
          newMap.set(url, previousVote);
        } else {
          newMap.delete(url);
        }
        return newMap;
      });
      // Rollback stats
      setStats(prev => {
        const newStats = { ...prev };
        if (type === 'up') newStats.upvotes--;
        if (type === 'down') newStats.downvotes--;
        if (previousVote === 'up') newStats.upvotes++;
        if (previousVote === 'down') newStats.downvotes++;
        if (!previousVote) newStats.total--;
        return newStats;
      });
    }
  }, [isConfigured, votes]);

  // Unvote action
  const unvote = useCallback(async (url: string) => {
    if (!isConfigured) return;

    const previousVote = votes.get(url);
    if (!previousVote) return;

    // Optimistic update
    setVotes(prev => {
      const newMap = new Map(prev);
      newMap.delete(url);
      return newMap;
    });

    // Update stats optimistically
    setStats(prev => ({
      ...prev,
      upvotes: prev.upvotes - (previousVote === 'up' ? 1 : 0),
      downvotes: prev.downvotes - (previousVote === 'down' ? 1 : 0),
      total: prev.total - 1
    }));

    // Sync to Supabase
    const result = await removeVote(url);

    // Rollback on failure
    if (!result.success) {
      console.error('Unvote failed, rolling back:', result.error);
      setVotes(prev => {
        const newMap = new Map(prev);
        newMap.set(url, previousVote);
        return newMap;
      });
      setStats(prev => ({
        ...prev,
        upvotes: prev.upvotes + (previousVote === 'up' ? 1 : 0),
        downvotes: prev.downvotes + (previousVote === 'down' ? 1 : 0),
        total: prev.total + 1
      }));
    }
  }, [isConfigured, votes]);

  // Get vote for a specific URL
  const getVote = useCallback((url: string): 'up' | 'down' | null => {
    return votes.get(url) || null;
  }, [votes]);

  // Refresh stats from server
  const refreshStats = useCallback(async () => {
    if (!isConfigured) return;
    const newStats = await getVoteStats();
    setStats(newStats);
  }, [isConfigured]);

  const value: VoteContextValue = {
    votes,
    stats,
    isLoading,
    isConfigured,
    vote,
    unvote,
    getVote,
    refreshStats
  };

  return (
    <VoteContext.Provider value={value}>
      {children}
    </VoteContext.Provider>
  );
}

// ============ Hook ============

export function useVotes(): VoteContextValue {
  const context = useContext(VoteContext);
  if (!context) {
    throw new Error('useVotes must be used within a VoteProvider');
  }
  return context;
}

// ============ Convenience Hook for Single Tweet ============

export function useTweetVote(tweetUrl: string) {
  const { getVote, vote, unvote, isConfigured, isLoading } = useVotes();
  
  const currentVote = getVote(tweetUrl);
  
  const handleVote = useCallback(async (type: 'up' | 'down', meta?: TweetMeta) => {
    if (currentVote === type) {
      // Toggle off if clicking the same vote type
      await unvote(tweetUrl);
    } else {
      await vote(tweetUrl, type, meta);
    }
  }, [tweetUrl, currentVote, vote, unvote]);

  return {
    currentVote,
    handleVote,
    isConfigured,
    isLoading
  };
}
