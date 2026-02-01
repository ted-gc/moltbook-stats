import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    if (!process.env.DATABASE_URL) {
      return NextResponse.json({ 
        error: 'DATABASE_URL not configured. Add Neon Postgres integration in Vercel.' 
      }, { status: 500 });
    }
    
    const sql = neon(process.env.DATABASE_URL);
    
    // Get current totals
    const [agents, posts, comments, submolts] = await Promise.all([
      sql`SELECT COUNT(*) as count FROM agents`,
      sql`SELECT COUNT(*) as count, SUM(upvotes) as upvotes, SUM(downvotes) as downvotes FROM posts`,
      sql`SELECT COUNT(*) as count FROM comments`,
      sql`SELECT COUNT(*) as count FROM submolts`
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

    // Get recent history (last 7 days, hourly)
    const history = await sql`
      SELECT 
        DATE_TRUNC('hour', captured_at) as hour,
        AVG(total_agents) as agents,
        AVG(total_posts) as posts,
        AVG(total_comments) as comments
      FROM stats_snapshots
      WHERE captured_at > NOW() - INTERVAL '7 days'
      GROUP BY DATE_TRUNC('hour', captured_at)
      ORDER BY hour ASC
    `;

    // Calculate changes
    const current = {
      totalAgents: Number(agents[0].count),
      totalPosts: Number(posts[0].count),
      totalComments: Number(comments[0].count),
      totalSubmolts: Number(submolts[0].count),
      totalUpvotes: Number(posts[0].upvotes || 0),
      totalDownvotes: Number(posts[0].downvotes || 0)
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
        timestamp: h.hour,
        agents: Number(h.agents),
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
