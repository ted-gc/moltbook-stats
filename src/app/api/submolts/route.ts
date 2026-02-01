import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    if (!process.env.DATABASE_URL) {
      return NextResponse.json({ error: 'DATABASE_URL not configured' }, { status: 500 });
    }

    const sql = neon(process.env.DATABASE_URL);

    // Get latest stats for top 5 submolts by subscriber count
    const latestSubmolts = await sql`
      WITH latest AS (
        SELECT DISTINCT ON (submolt_name) *
        FROM submolt_snapshots
        ORDER BY submolt_name, captured_at DESC
      )
      SELECT * FROM latest
      ORDER BY subscriber_count DESC
      LIMIT 5
    `;

    // Get historical data for each of these submolts (last 24 hours)
    const submoltNames = latestSubmolts.map(s => s.submolt_name);
    
    const history = await sql`
      SELECT 
        submolt_name,
        captured_at,
        subscriber_count,
        post_count,
        total_upvotes,
        total_downvotes,
        total_comments
      FROM submolt_snapshots
      WHERE submolt_name = ANY(${submoltNames})
        AND captured_at > NOW() - INTERVAL '24 hours'
      ORDER BY submolt_name, captured_at ASC
    `;

    // Group history by submolt
    const historyBySubmolt: Record<string, Array<{
      timestamp: string;
      subscribers: number;
      posts: number;
      upvotes: number;
      comments: number;
    }>> = {};

    for (const row of history) {
      if (!historyBySubmolt[row.submolt_name]) {
        historyBySubmolt[row.submolt_name] = [];
      }
      historyBySubmolt[row.submolt_name].push({
        timestamp: row.captured_at,
        subscribers: Number(row.subscriber_count),
        posts: Number(row.post_count),
        upvotes: Number(row.total_upvotes),
        comments: Number(row.total_comments)
      });
    }

    return NextResponse.json({
      submolts: latestSubmolts.map(s => ({
        name: s.submolt_name,
        displayName: s.display_name,
        current: {
          subscribers: Number(s.subscriber_count),
          posts: Number(s.post_count),
          upvotes: Number(s.total_upvotes),
          downvotes: Number(s.total_downvotes),
          comments: Number(s.total_comments)
        },
        history: historyBySubmolt[s.submolt_name] || []
      }))
    });
  } catch (error) {
    console.error('Submolts error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
