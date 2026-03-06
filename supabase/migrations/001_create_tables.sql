-- X Swipe Phase 1: Database Schema
-- Run this in Supabase SQL Editor

-- ============ tweets table ============
CREATE TABLE IF NOT EXISTS tweets (
  id TEXT PRIMARY KEY,
  project_id UUID DEFAULT gen_random_uuid(),
  author TEXT NOT NULL,
  url TEXT NOT NULL,
  text TEXT NOT NULL,
  translation_zh TEXT,
  detected_language TEXT,
  "group" TEXT,
  likes INTEGER DEFAULT 0,
  replies INTEGER DEFAULT 0,
  retweets INTEGER DEFAULT 0,
  raw_engagement REAL DEFAULT 0,
  final_score REAL DEFAULT 0,
  ai_picked BOOLEAN DEFAULT FALSE,
  relevance_keywords TEXT[],
  pain_emotion_words TEXT[],
  reason TEXT,
  suggested_reply TEXT,
  reply_translation_zh TEXT,
  reply_angle TEXT,
  intent_url TEXT,
  tweet_datetime TIMESTAMPTZ,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  source_file TEXT
);

CREATE INDEX IF NOT EXISTS idx_tweets_fetched_at ON tweets (fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_tweets_group ON tweets ("group");

-- ============ decisions table ============
CREATE TABLE IF NOT EXISTS decisions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tweet_id TEXT NOT NULL REFERENCES tweets(id),
  user_id TEXT NOT NULL,
  project_id UUID,
  action TEXT NOT NULL CHECK (action IN ('confirmed', 'skipped')),
  skip_reason TEXT CHECK (
    skip_reason IS NULL OR skip_reason IN (
      'is_ad',
      'customer_service',
      'too_old',
      'no_angle',
      'not_relevant',
      'other'
    )
  ),
  skip_note TEXT,
  decided_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tweet_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_decisions_user_date ON decisions (user_id, decided_at DESC);
CREATE INDEX IF NOT EXISTS idx_decisions_action ON decisions (action);

-- ============ strategy_logs table ============
CREATE TABLE IF NOT EXISTS strategy_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id UUID,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_reviewed INTEGER,
  total_confirmed INTEGER,
  total_skipped INTEGER,
  skip_reasons JSONB,
  insights TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
