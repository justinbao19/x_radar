import { createClient } from '@supabase/supabase-js';

// ============ Supabase Client ============

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('Supabase credentials not configured. Voting will be disabled.');
}

export const supabase = supabaseUrl && supabaseKey 
  ? createClient(supabaseUrl, supabaseKey)
  : null;

// ============ Types ============

export interface Vote {
  id?: string;
  tweet_url: string;
  vote_type: 'up' | 'down';
  tweet_text?: string;
  tweet_group?: string;
  source_query?: string;
  voted_at?: string;
  applied?: boolean;
  applied_at?: string;
}

export interface VoteInput {
  tweetUrl: string;
  voteType: 'up' | 'down';
  tweetText?: string;
  tweetGroup?: string;
  sourceQuery?: string;
}

// ============ API Functions ============

/**
 * Submit or update a vote
 * Uses upsert to handle both new votes and vote changes
 */
export async function submitVote(vote: VoteInput): Promise<{ success: boolean; error?: string }> {
  if (!supabase) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    const { error } = await supabase
      .from('votes')
      .upsert({
        tweet_url: vote.tweetUrl,
        vote_type: vote.voteType,
        tweet_text: vote.tweetText,
        tweet_group: vote.tweetGroup,
        source_query: vote.sourceQuery,
        voted_at: new Date().toISOString(),
        applied: false  // Reset applied status when vote changes
      }, { 
        onConflict: 'tweet_url' 
      });

    if (error) {
      console.error('Vote submission error:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error('Vote submission exception:', err);
    return { success: false, error: 'Network error' };
  }
}

/**
 * Submit feedback for a downvote
 */
export async function submitDownvoteFeedback(
  tweetUrl: string, 
  feedback: string
): Promise<{ success: boolean; error?: string }> {
  if (!supabase) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    const { error } = await supabase
      .from('votes')
      .update({ 
        feedback,
        feedback_at: new Date().toISOString()
      })
      .eq('tweet_url', tweetUrl);

    if (error) {
      console.error('Feedback submission error:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error('Feedback submission exception:', err);
    return { success: false, error: 'Network error' };
  }
}

/**
 * Remove a vote (for undo functionality)
 */
export async function removeVote(tweetUrl: string): Promise<{ success: boolean; error?: string }> {
  if (!supabase) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    const { error } = await supabase
      .from('votes')
      .delete()
      .eq('tweet_url', tweetUrl);

    if (error) {
      console.error('Vote removal error:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error('Vote removal exception:', err);
    return { success: false, error: 'Network error' };
  }
}

/**
 * Get all votes (for loading initial state)
 */
export async function getAllVotes(): Promise<Map<string, 'up' | 'down'>> {
  const voteMap = new Map<string, 'up' | 'down'>();
  
  if (!supabase) {
    return voteMap;
  }

  try {
    const { data, error } = await supabase
      .from('votes')
      .select('tweet_url, vote_type');

    if (error) {
      console.error('Failed to fetch votes:', error);
      return voteMap;
    }

    data?.forEach(v => {
      voteMap.set(v.tweet_url, v.vote_type as 'up' | 'down');
    });
  } catch (err) {
    console.error('Failed to fetch votes:', err);
  }

  return voteMap;
}

/**
 * Get vote statistics
 */
export async function getVoteStats(): Promise<{ upvotes: number; downvotes: number; total: number }> {
  if (!supabase) {
    return { upvotes: 0, downvotes: 0, total: 0 };
  }

  try {
    const { data, error } = await supabase
      .from('votes')
      .select('vote_type');

    if (error) {
      console.error('Failed to fetch vote stats:', error);
      return { upvotes: 0, downvotes: 0, total: 0 };
    }

    const upvotes = data?.filter(v => v.vote_type === 'up').length || 0;
    const downvotes = data?.filter(v => v.vote_type === 'down').length || 0;

    return { upvotes, downvotes, total: upvotes + downvotes };
  } catch (err) {
    console.error('Failed to fetch vote stats:', err);
    return { upvotes: 0, downvotes: 0, total: 0 };
  }
}

/**
 * Check if Supabase is configured and available
 */
export function isSupabaseConfigured(): boolean {
  return supabase !== null;
}

// ============ Comment Cache Types ============

export interface CachedComment {
  id?: string;
  tweet_url: string;
  tweet_text?: string;
  language?: string;
  comments: object;  // TweetComments object
  created_at?: string;
  expires_at?: string;
}

// ============ Comment Cache Functions ============

/**
 * Get cached comments for a tweet
 * Returns null if not found or expired
 */
export async function getCachedComments(tweetUrl: string): Promise<object | null> {
  if (!supabase) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('tweet_comments')
      .select('comments, expires_at')
      .eq('tweet_url', tweetUrl)
      .single();

    if (error || !data) {
      return null;
    }

    // Check if expired
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      // Expired, delete and return null
      await supabase.from('tweet_comments').delete().eq('tweet_url', tweetUrl);
      return null;
    }

    return data.comments;
  } catch (err) {
    console.error('Failed to fetch cached comments:', err);
    return null;
  }
}

/**
 * Save comments to cache
 * Sets expiration to 7 days from now
 */
export async function saveCachedComments(
  tweetUrl: string,
  tweetText: string,
  language: string,
  comments: object
): Promise<{ success: boolean; error?: string }> {
  if (!supabase) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days from now

    const { error } = await supabase
      .from('tweet_comments')
      .upsert({
        tweet_url: tweetUrl,
        tweet_text: tweetText,
        language: language,
        comments: comments,
        created_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString()
      }, {
        onConflict: 'tweet_url'
      });

    if (error) {
      console.error('Failed to save cached comments:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error('Failed to save cached comments:', err);
    return { success: false, error: 'Network error' };
  }
}

/**
 * Clean up expired comment cache entries
 * Returns the number of deleted entries
 */
export async function cleanupExpiredComments(): Promise<number> {
  if (!supabase) {
    return 0;
  }

  try {
    const { data, error } = await supabase
      .from('tweet_comments')
      .delete()
      .lt('expires_at', new Date().toISOString())
      .select('id');

    if (error) {
      console.error('Failed to cleanup expired comments:', error);
      return 0;
    }

    return data?.length || 0;
  } catch (err) {
    console.error('Failed to cleanup expired comments:', err);
    return 0;
  }
}
