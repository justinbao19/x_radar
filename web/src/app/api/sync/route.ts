import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { fetchManifest, fetchDataFile } from '@/lib/github';
import { filterTweets, sortForSwipe } from '@/lib/filters';
import { Tweet } from '@/lib/types';

function extractTweetId(url: string): string {
  const match = url.match(/status\/(\d+)/);
  return match ? match[1] : url;
}

function buildReason(tweet: Tweet): string {
  const parts: string[] = [];
  if (tweet.aiPicked) parts.push('AI 精选');
  if (tweet.finalScore >= 200) parts.push(`高分 ${Math.round(tweet.finalScore)}`);
  if (tweet.painEmotionWords?.length) parts.push(tweet.painEmotionWords.join('·'));
  if (tweet.group === 'pain') parts.push('用户痛点');
  if (tweet.group === 'sentiment') parts.push('品牌提及');
  if (tweet.group === 'insight') parts.push('用户洞察');
  return parts.join(' · ') || '符合筛选条件';
}

function buildSuggestedReply(tweet: Tweet): string | null {
  if (!tweet.comments?.options?.length) return null;
  const recommended = tweet.comments.options.find(o => o.recommended);
  return recommended?.comment ?? tweet.comments.options[0]?.comment ?? null;
}

function buildReplyAngle(tweet: Tweet): string | null {
  if (!tweet.comments?.options?.length) return null;
  const recommended = tweet.comments.options.find(o => o.recommended);
  const angle = recommended?.angle ?? tweet.comments.options[0]?.angle;
  const angleLabels: Record<string, string> = {
    witty: '机智回复',
    practical: '实用建议',
    subtle_product: '产品植入',
  };
  return angle ? angleLabels[angle] ?? angle : null;
}

function buildIntentUrl(tweetUrl: string, replyText: string | null): string | null {
  if (!replyText) return null;
  const tweetId = extractTweetId(tweetUrl);
  return `https://x.com/intent/tweet?in_reply_to=${tweetId}&text=${encodeURIComponent(replyText)}`;
}

export async function POST() {
  try {
    const supabase = createServerSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
    }

    const manifest = await fetchManifest();
    if (!manifest?.files?.length) {
      return NextResponse.json({ error: 'No data files in manifest' }, { status: 404 });
    }

    const latestFiles = manifest.files.slice(0, 4);
    let allTweets: Tweet[] = [];

    for (const fileInfo of latestFiles) {
      const data = await fetchDataFile(fileInfo.filename);
      if (data?.top) {
        allTweets.push(...data.top);
      }
    }

    if (allTweets.length === 0) {
      return NextResponse.json({ synced: 0, message: 'No tweets found in data files' });
    }

    // Deduplicate by URL
    const seenUrls = new Set<string>();
    allTweets = allTweets.filter(t => {
      if (!t.url || seenUrls.has(t.url)) return false;
      seenUrls.add(t.url);
      return true;
    });

    const { passed } = filterTweets(allTweets);
    const sorted = sortForSwipe(passed);

    const rows = sorted.map(tweet => {
      const suggestedReply = buildSuggestedReply(tweet);
      // Runtime data from select.mjs may have extra fields not in the Tweet type
      const extra = tweet as Tweet & Record<string, unknown>;
      return {
        id: extractTweetId(tweet.url),
        author: tweet.author,
        url: tweet.url,
        text: tweet.text,
        translation_zh: tweet.translationZh ?? tweet.comments?.tweetTranslationZh ?? null,
        detected_language: tweet.detectedLanguage ?? null,
        group: tweet.group,
        likes: tweet.likes ?? 0,
        replies: tweet.replies ?? 0,
        retweets: tweet.retweets ?? 0,
        raw_engagement: (tweet.likes ?? 0) * 2 + (tweet.retweets ?? 0) * 2 + (tweet.replies ?? 0) * 1.5,
        final_score: tweet.finalScore ?? 0,
        ai_picked: tweet.aiPicked ?? false,
        relevance_keywords: (extra.relevanceKeywords as string[]) ?? [],
        pain_emotion_words: tweet.painEmotionWords ?? [],
        reason: buildReason(tweet),
        suggested_reply: suggestedReply,
        reply_translation_zh: tweet.comments?.options?.find(o => o.recommended)?.comment_zh ?? null,
        reply_angle: buildReplyAngle(tweet),
        intent_url: buildIntentUrl(tweet.url, suggestedReply),
        tweet_datetime: tweet.datetime ?? null,
        source_file: latestFiles[0]?.filename ?? null,
      };
    });

    const { error, count } = await supabase
      .from('tweets')
      .upsert(rows, { onConflict: 'id', ignoreDuplicates: true })
      .select('id');

    if (error) {
      console.error('Supabase upsert error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      synced: count ?? rows.length,
      total_candidates: allTweets.length,
      after_filter: sorted.length,
      source_files: latestFiles.map(f => f.filename),
    });
  } catch (err) {
    console.error('Sync error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return POST();
}
