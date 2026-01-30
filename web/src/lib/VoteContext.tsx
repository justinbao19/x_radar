'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { submitVote, submitDownvoteFeedback, removeVote, getAllVotes, getVoteStats, isSupabaseConfigured } from './supabase';

// ============ Types ============

interface TweetMeta {
  text?: string;
  group?: string;
  sourceQuery?: string;
}

interface PendingDownvote {
  url: string;
  meta?: TweetMeta;
}

interface VoteContextValue {
  // Vote state
  votes: Map<string, 'up' | 'down'>;
  
  // Hidden tweets (downvoted tweets that should be hidden from view)
  hiddenUrls: Set<string>;
  
  // Statistics
  stats: { upvotes: number; downvotes: number; total: number };
  
  // Loading state
  isLoading: boolean;
  isConfigured: boolean;
  
  // Feedback modal state
  feedbackModal: {
    isOpen: boolean;
    tweetUrl: string | null;
    tweetText?: string;
  };
  
  // Actions
  vote: (url: string, type: 'up' | 'down', meta?: TweetMeta) => Promise<void>;
  unvote: (url: string) => Promise<void>;
  getVote: (url: string) => 'up' | 'down' | null;
  refreshStats: () => Promise<void>;
  
  // Downvote with feedback
  initiateDownvote: (url: string, meta?: TweetMeta) => void;
  confirmDownvote: (feedback: string | null) => Promise<void>;
  cancelDownvote: () => void;
}

// ============ Context ============

const VoteContext = createContext<VoteContextValue | null>(null);

// ============ Provider ============

interface VoteProviderProps {
  children: ReactNode;
}

export function VoteProvider({ children }: VoteProviderProps) {
  const [votes, setVotes] = useState<Map<string, 'up' | 'down'>>(new Map());
  const [hiddenUrls, setHiddenUrls] = useState<Set<string>>(new Set());
  const [stats, setStats] = useState({ upvotes: 0, downvotes: 0, total: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const isConfigured = isSupabaseConfigured();
  
  // Feedback modal state
  const [feedbackModal, setFeedbackModal] = useState<{
    isOpen: boolean;
    tweetUrl: string | null;
    tweetText?: string;
  }>({ isOpen: false, tweetUrl: null });
  
  // Pending downvote (waiting for feedback)
  const [pendingDownvote, setPendingDownvote] = useState<PendingDownvote | null>(null);

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
        
        // Initialize hidden URLs from downvotes
        const hidden = new Set<string>();
        votesData.forEach((voteType, url) => {
          if (voteType === 'down') {
            hidden.add(url);
          }
        });
        setHiddenUrls(hidden);
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

  // Initiate downvote - opens feedback modal
  const initiateDownvote = useCallback((url: string, meta?: TweetMeta) => {
    setPendingDownvote({ url, meta });
    setFeedbackModal({
      isOpen: true,
      tweetUrl: url,
      tweetText: meta?.text
    });
  }, []);

  // Confirm downvote with optional feedback
  const confirmDownvote = useCallback(async (feedback: string | null) => {
    if (!pendingDownvote) return;
    
    const { url, meta } = pendingDownvote;
    
    // Hide the tweet immediately (optimistic update)
    setHiddenUrls(prev => {
      const newSet = new Set(prev);
      newSet.add(url);
      return newSet;
    });
    
    // Close modal
    setFeedbackModal({ isOpen: false, tweetUrl: null });
    setPendingDownvote(null);
    
    // Submit the vote
    await vote(url, 'down', meta);
    
    // Submit feedback if provided
    if (feedback) {
      await submitDownvoteFeedback(url, feedback);
    }
  }, [pendingDownvote, vote]);

  // Cancel downvote - closes modal without action
  const cancelDownvote = useCallback(() => {
    setFeedbackModal({ isOpen: false, tweetUrl: null });
    setPendingDownvote(null);
  }, []);

  const value: VoteContextValue = {
    votes,
    hiddenUrls,
    stats,
    isLoading,
    isConfigured,
    feedbackModal,
    vote,
    unvote,
    getVote,
    refreshStats,
    initiateDownvote,
    confirmDownvote,
    cancelDownvote
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
  const { getVote, vote, unvote, initiateDownvote, isConfigured, isLoading, hiddenUrls } = useVotes();
  
  const currentVote = getVote(tweetUrl);
  const isHidden = hiddenUrls.has(tweetUrl);
  
  const handleVote = useCallback(async (type: 'up' | 'down', meta?: TweetMeta) => {
    if (type === 'down') {
      // For downvote, show feedback modal first
      initiateDownvote(tweetUrl, meta);
    } else if (currentVote === type) {
      // Toggle off if clicking the same vote type (upvote only)
      await unvote(tweetUrl);
    } else {
      await vote(tweetUrl, type, meta);
    }
  }, [tweetUrl, currentVote, vote, unvote, initiateDownvote]);

  return {
    currentVote,
    handleVote,
    isConfigured,
    isLoading,
    isHidden
  };
}
