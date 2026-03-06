import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { SummaryResponse, SkipReason } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');
    const targetDate = dateParam || new Date().toISOString().split('T')[0];
    const dayStart = `${targetDate}T00:00:00.000Z`;
    const dayEnd = `${targetDate}T23:59:59.999Z`;

    // Fetch all decisions for the date, joined with tweet data
    const { data: decisions, error: decisionsError } = await supabase
      .from('decisions')
      .select(`
        tweet_id,
        action,
        skip_reason,
        skip_note,
        tweets!inner (
          id,
          author,
          url,
          text,
          suggested_reply,
          intent_url
        )
      `)
      .gte('decided_at', dayStart)
      .lte('decided_at', dayEnd);

    if (decisionsError) {
      return NextResponse.json({ error: decisionsError.message }, { status: 500 });
    }

    const confirmed: SummaryResponse['confirmed'] = [];
    const skipped: SummaryResponse['skipped'] = [];
    const skipReasons: Record<string, number> = {};

    for (const d of decisions ?? []) {
      const tweet = d.tweets as unknown as {
        id: string;
        author: string;
        url: string;
        text: string;
        suggested_reply: string | null;
        intent_url: string | null;
      };

      if (d.action === 'confirmed') {
        confirmed.push({
          id: tweet.id,
          author: tweet.author,
          url: tweet.url,
          text: tweet.text,
          suggestedReply: tweet.suggested_reply,
          intentUrl: tweet.intent_url,
        });
      } else {
        skipped.push({
          id: tweet.id,
          reason: d.skip_reason as SkipReason | null,
          note: d.skip_note,
        });
        if (d.skip_reason) {
          skipReasons[d.skip_reason] = (skipReasons[d.skip_reason] || 0) + 1;
        }
      }
    }

    const response: SummaryResponse = {
      date: targetDate,
      confirmed,
      skipped,
      stats: {
        total: confirmed.length + skipped.length,
        confirmed: confirmed.length,
        skipped: skipped.length,
        skipReasons,
      },
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error('Summary API error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
