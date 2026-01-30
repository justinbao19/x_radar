-- ============================================
-- Supabase Schema for X-Radar Comment Cache
-- ============================================

-- Create tweet_comments table for caching on-demand generated comments
CREATE TABLE IF NOT EXISTS tweet_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tweet_url TEXT UNIQUE NOT NULL,
  tweet_text TEXT,
  language VARCHAR(10),
  comments JSONB NOT NULL,  -- TweetComments object
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '7 days')
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_tweet_comments_url ON tweet_comments(tweet_url);
CREATE INDEX IF NOT EXISTS idx_tweet_comments_expires ON tweet_comments(expires_at);

-- ============================================
-- Cleanup Function for Expired Comments
-- ============================================

-- Function to clean up expired comment cache entries
CREATE OR REPLACE FUNCTION cleanup_expired_comments()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM tweet_comments WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Automatic Cleanup (Optional - requires pg_cron extension)
-- ============================================

-- If pg_cron is enabled, schedule daily cleanup at 4 AM UTC
-- Uncomment the following lines if pg_cron is available:

-- SELECT cron.schedule(
--   'cleanup-expired-comments',
--   '0 4 * * *',
--   $$SELECT cleanup_expired_comments()$$
-- );

-- ============================================
-- Row Level Security (RLS) Policies
-- ============================================

-- Enable RLS
ALTER TABLE tweet_comments ENABLE ROW LEVEL SECURITY;

-- Allow anonymous read access (for fetching cached comments)
CREATE POLICY "Allow anonymous read" ON tweet_comments
  FOR SELECT
  USING (true);

-- Allow anonymous insert (for saving new comments)
CREATE POLICY "Allow anonymous insert" ON tweet_comments
  FOR INSERT
  WITH CHECK (true);

-- Allow anonymous update (for upsert)
CREATE POLICY "Allow anonymous update" ON tweet_comments
  FOR UPDATE
  USING (true);

-- Allow anonymous delete (for cleanup)
CREATE POLICY "Allow anonymous delete" ON tweet_comments
  FOR DELETE
  USING (true);

-- ============================================
-- Useful Queries
-- ============================================

-- View all cached comments
-- SELECT * FROM tweet_comments ORDER BY created_at DESC;

-- View comments expiring soon (within 1 day)
-- SELECT * FROM tweet_comments WHERE expires_at < NOW() + INTERVAL '1 day';

-- Manually trigger cleanup
-- SELECT cleanup_expired_comments();

-- Check cache stats
-- SELECT 
--   COUNT(*) as total_cached,
--   COUNT(*) FILTER (WHERE expires_at < NOW()) as expired,
--   COUNT(*) FILTER (WHERE expires_at >= NOW()) as active
-- FROM tweet_comments;
