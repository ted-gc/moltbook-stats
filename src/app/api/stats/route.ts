import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

const MOLTBOOK_API = 'https://www.moltbook.com/api/v1';

export async function GET() {
  try {
    if (!process.env.DATABASE_URL) {
      return NextResponse.json({ 
        error: 'DATABASE_URL not configured. Add Neon Postgres integration in Vercel.' 
      }, { status: 500 });
    }
    
    const sql = neon(process.env.DATABASE_URL);
    
    // Fetch LIVE stats from Moltbook API /stats endpoint
    const moltbookResponse = await fetch(`${MOLTBOOK_API}/stats`);
    const moltbookData = await moltbookResponse.json();
    
    // Get upvote/downvote sums from our database (not in Moltbook API)
    const [posts] = await Promise.all([
      sql`SELECT SUM(upvotes) as upvotes, SUM(downvotes) as downvotes FROM posts`
    ]);

    // Get latest snapshot for comparison
    const latestSnapshot = await sql`
      SELECT * FROM stats_snapshots 
      ORDER BY captured_at DESC 
      LIMIT 1
    `;

    // Get 24h ago snapshot
    const snapshot24h = await sql`
      SELECT * FROM stats_snapshots 
      WHERE captured_at < NOW() - INTERVAL '24 hours'
      ORDER BY captured_at DESC 
      LIMIT 1
    `;

    // Get recent history (last 24 hours, per-minute granularity)
    const history = await sql`
      SELECT 
        captured_at as timestamp,
        total_agents as agents,
        total_submolts as submolts,
        total_posts as posts,
        total_comments as comments
      FROM stats_snapshots
      WHERE captured_at > NOW() - INTERVAL '24 hours'
      ORDER BY captured_at ASC
    `;

    // Use LIVE stats from Moltbook /stats API
    const current = {
      totalAgents: Number(moltbookData.agents || 0),       // From API
      totalSubmolts: Number(moltbookData.submolts || 0),   // From API
      totalPosts: Number(moltbookData.posts || 0),         // From API
      totalComments: Number(moltbookData.comments || 0),   // From API
      totalUpvotes: Number(posts[0].upvotes || 0),   // From our DB (not in API)
      totalDownvotes: Number(posts[0].downvotes || 0), // From our DB (not in API)
      lastUpdated: moltbookData.last_updated
    };

    const changes24h = snapshot24h[0] ? {
      agents: current.totalAgents - Number(snapshot24h[0].total_agents),
      posts: current.totalPosts - Number(snapshot24h[0].total_posts),
      comments: current.totalComments - Number(snapshot24h[0].total_comments)
    } : null;

    return NextResponse.json({
      current,
      changes24h,
      lastSnapshot: latestSnapshot[0]?.captured_at,
      history: history.map(h => ({
        timestamp: h.timestamp,
        agents: Number(h.agents),
        submolts: Number(h.submolts),
        posts: Number(h.posts),
        comments: Number(h.comments)
      }))
    });
  } catch (error) {
    console.error('Stats error:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}
