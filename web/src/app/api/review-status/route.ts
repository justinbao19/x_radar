import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ statuses: {} });
    }

    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');
    const targetDate = dateParam || new Date().toISOString().split('T')[0];
    const dayStart = `${targetDate}T00:00:00.000Z`;
    const dayEnd = `${targetDate}T23:59:59.999Z`;

    const { data, error } = await supabase
      .from('decisions')
      .select(`
        action,
        skip_reason,
        tweets!inner ( url )
      `)
      .gte('decided_at', dayStart)
      .lte('decided_at', dayEnd);

    if (error) {
      console.error('Review status error:', error);
      return NextResponse.json({ statuses: {} });
    }

    const statuses: Record<string, { action: string; skipReason?: string }> = {};
    for (const d of data ?? []) {
      const tweet = d.tweets as unknown as { url: string };
      if (tweet?.url) {
        statuses[tweet.url] = {
          action: d.action,
          ...(d.skip_reason && { skipReason: d.skip_reason }),
        };
      }
    }

    return NextResponse.json({ statuses });
  } catch (err) {
    console.error('Review status error:', err);
    return NextResponse.json({ statuses: {} });
  }
}
