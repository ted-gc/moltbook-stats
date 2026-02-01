import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MOLTBOOK_API = 'https://www.moltbook.com/api/v1';

export async function GET(request: Request) {
  try {
    // Verify cron secret (optional security)
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      // Allow without auth for now, but log it
      console.log('Cron called without auth');
    }

    if (!process.env.DATABASE_URL) {
      return NextResponse.json({ error: 'DATABASE_URL not configured' }, { status: 500 });
    }

    const sql = neon(process.env.DATABASE_URL);

    // Fetch stats from Moltbook
    const response = await fetch(`${MOLTBOOK_API}/stats`);
    const data = await response.json();

    if (!data.success) {
      return NextResponse.json({ error: 'Moltbook API error', data }, { status: 500 });
    }

    // Store snapshot
    await sql`
      INSERT INTO stats_snapshots (
        captured_at, 
        total_agents, 
        total_posts, 
        total_comments, 
        total_submolts,
        total_upvotes,
        total_downvotes
      ) VALUES (
        NOW(),
        ${data.agents},
        ${data.posts},
        ${data.comments},
        ${data.submolts},
        0,
        0
      )
    `;

    return NextResponse.json({
      success: true,
      snapshot: {
        agents: data.agents,
        submolts: data.submolts,
        posts: data.posts,
        comments: data.comments,
        capturedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Cron error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// Allow POST for manual triggers
export async function POST(request: Request) {
  return GET(request);
}
