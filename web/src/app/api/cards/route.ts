import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { SwipeTweet, CardsResponse } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id');
    const dateParam = searchParams.get('date');
    const groupFilter = searchParams.get('group');

    if (!userId) {
      return NextResponse.json({ error: 'user_id is required' }, { status: 400 });
    }

    const targetDate = dateParam || new Date().toISOString().split('T')[0];
    const dayStart = `${targetDate}T00:00:00.000Z`;
    const dayEnd = `${targetDate}T23:59:59.999Z`;

    // Fetch tweets for the target date
    const { data: tweets, error: tweetsError } = await supabase
      .from('tweets')
      .select('*')
      .gte('fetched_at', dayStart)
      .lte('fetched_at', dayEnd)
      .order('final_score', { ascending: false });

    if (tweetsError) {
      return NextResponse.json({ error: tweetsError.message }, { status: 500 });
    }

    if (!tweets?.length) {
      const response: CardsResponse = { cards: [], total: 0, reviewed: 0, remaining: 0 };
      return NextResponse.json(response);
    }

    // Fetch existing decisions for this user
    const tweetIds = tweets.map(t => t.id);
    const { data: decisions, error: decisionsError } = await supabase
      .from('decisions')
      .select('tweet_id')
      .eq('user_id', userId)
      .in('tweet_id', tweetIds);

    if (decisionsError) {
      return NextResponse.json({ error: decisionsError.message }, { status: 500 });
    }

    const decidedIds = new Set((decisions ?? []).map(d => d.tweet_id));

    // Sort: sentiment first, then aiPicked + high score, then by finalScore
    const groupPriority: Record<string, number> = {
      sentiment: 0,
      pain: 1,
      insight: 2,
      reach: 3,
    };

    const groupMap: Record<string, string[]> = {
      pain_radar: ['pain', 'reach'],
      filo_sentiment: ['sentiment'],
      user_insight: ['insight'],
    };
    const allowedGroups = groupFilter ? groupMap[groupFilter] ?? [groupFilter] : null;

    const undecided = tweets
      .filter(t => !decidedIds.has(t.id))
      .filter(t => !allowedGroups || allowedGroups.includes(t.group))
      .sort((a, b) => {
        const aPri = groupPriority[a.group] ?? 4;
        const bPri = groupPriority[b.group] ?? 4;
        if (aPri !== bPri) return aPri - bPri;
        const aAi = a.ai_picked ? 1 : 0;
        const bAi = b.ai_picked ? 1 : 0;
        if (aAi !== bAi) return bAi - aAi;
        return (b.final_score ?? 0) - (a.final_score ?? 0);
      });

    const cards: SwipeTweet[] = undecided.map(t => ({
      id: t.id,
      author: t.author,
      url: t.url,
      text: t.text,
      translationZh: t.translation_zh,
      group: t.group,
      language: t.detected_language,
      engagement: {
        likes: t.likes ?? 0,
        replies: t.replies ?? 0,
        retweets: t.retweets ?? 0,
      },
      finalScore: t.final_score ?? 0,
      aiPicked: t.ai_picked ?? false,
      reason: t.reason,
      suggestedReply: t.suggested_reply,
      replyTranslationZh: t.reply_translation_zh,
      replyAngle: t.reply_angle,
      intentUrl: t.intent_url,
      tweetDatetime: t.tweet_datetime,
      relevanceKeywords: t.relevance_keywords ?? [],
      painEmotionWords: t.pain_emotion_words ?? [],
    }));

    const response: CardsResponse = {
      cards,
      total: tweets.length,
      reviewed: decidedIds.size,
      remaining: cards.length,
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error('Cards API error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
