import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { DecisionRequest, DecisionResponse } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
    }

    const body = (await request.json()) as DecisionRequest;

    if (!body.tweetId || !body.userId || !body.action) {
      return NextResponse.json(
        { error: 'tweetId, userId, and action are required' },
        { status: 400 }
      );
    }

    if (body.action !== 'confirmed' && body.action !== 'skipped') {
      return NextResponse.json(
        { error: 'action must be "confirmed" or "skipped"' },
        { status: 400 }
      );
    }

    const { error: insertError } = await supabase.from('decisions').upsert(
      {
        tweet_id: body.tweetId,
        user_id: body.userId,
        action: body.action,
        skip_reason: body.skipReason ?? null,
        skip_note: body.skipNote ?? null,
        decided_at: new Date().toISOString(),
      },
      { onConflict: 'tweet_id,user_id' }
    );

    if (insertError) {
      console.error('Decision insert error:', insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // Count remaining undecided tweets for today
    const today = new Date().toISOString().split('T')[0];
    const dayStart = `${today}T00:00:00.000Z`;
    const dayEnd = `${today}T23:59:59.999Z`;

    const { count: totalCount } = await supabase
      .from('tweets')
      .select('id', { count: 'exact', head: true })
      .gte('fetched_at', dayStart)
      .lte('fetched_at', dayEnd);

    const { count: decidedCount } = await supabase
      .from('decisions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', body.userId)
      .gte('decided_at', dayStart)
      .lte('decided_at', dayEnd);

    const remaining = Math.max(0, (totalCount ?? 0) - (decidedCount ?? 0));

    const response: DecisionResponse = { success: true, remaining };
    return NextResponse.json(response);
  } catch (err) {
    console.error('Decision API error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const tweetId = searchParams.get('tweet_id');
    const userId = searchParams.get('user_id');

    if (!tweetId || !userId) {
      return NextResponse.json(
        { error: 'tweet_id and user_id are required' },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from('decisions')
      .delete()
      .eq('tweet_id', tweetId)
      .eq('user_id', userId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Decision delete error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
