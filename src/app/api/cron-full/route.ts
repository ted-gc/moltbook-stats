import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 min timeout

const MOLTBOOK_API = 'https://www.moltbook.com/api/v1';

interface Submolt {
  id: string;
  name: string;
  display_name: string;
  subscriber_count: number;
}

interface Post {
  id: string;
  title: string;
  upvotes: number;
  downvotes: number;
  comment_count: number;
}

interface SubmoltDetail {
  submolt: Submolt;
  posts: Post[];
}

export async function GET() {
  try {
    if (!process.env.DATABASE_URL) {
      return NextResponse.json({ error: 'DATABASE_URL not configured' }, { status: 500 });
    }

    const sql = neon(process.env.DATABASE_URL);
    const startTime = Date.now();

    // 1. Fetch global stats
    const statsRes = await fetch(`${MOLTBOOK_API}/stats`);
    const statsData = await statsRes.json();

    // Store global snapshot
    await sql`
      INSERT INTO stats_snapshots (
        captured_at, total_agents, total_posts, total_comments, total_submolts, total_upvotes, total_downvotes
      ) VALUES (
        NOW(), ${statsData.agents}, ${statsData.posts}, ${statsData.comments}, ${statsData.submolts}, 0, 0
      )
    `;

    // 2. Fetch all submolts (paginated)
    const submoltsRes = await fetch(`${MOLTBOOK_API}/submolts?limit=100`);
    const submoltsData = await submoltsRes.json();
    const submolts: Submolt[] = submoltsData.submolts || [];

    // 3. For top 20 submolts by subscriber count, fetch detailed stats
    const topSubmolts = [...submolts]
      .sort((a, b) => b.subscriber_count - a.subscriber_count)
      .slice(0, 20);

    const submoltStats: Array<{
      id: string;
      name: string;
      display_name: string;
      subscriber_count: number;
      post_count: number;
      total_upvotes: number;
      total_downvotes: number;
      total_comments: number;
    }> = [];

    for (const submolt of topSubmolts) {
      try {
        const detailRes = await fetch(`${MOLTBOOK_API}/submolts/${submolt.name}`);
        const detail: SubmoltDetail = await detailRes.json();
        
        if (detail.posts) {
          const postCount = detail.posts.length;
          const totalUpvotes = detail.posts.reduce((sum, p) => sum + (p.upvotes || 0), 0);
          const totalDownvotes = detail.posts.reduce((sum, p) => sum + (p.downvotes || 0), 0);
          const totalComments = detail.posts.reduce((sum, p) => sum + (p.comment_count || 0), 0);

          submoltStats.push({
            id: submolt.id,
            name: submolt.name,
            display_name: submolt.display_name,
            subscriber_count: detail.submolt?.subscriber_count || submolt.subscriber_count,
            post_count: postCount,
            total_upvotes: totalUpvotes,
            total_downvotes: totalDownvotes,
            total_comments: totalComments
          });

          // Store submolt snapshot
          await sql`
            INSERT INTO submolt_snapshots (
              captured_at, submolt_id, submolt_name, display_name, 
              subscriber_count, post_count, total_upvotes, total_downvotes, total_comments
            ) VALUES (
              NOW(), ${submolt.id}, ${submolt.name}, ${submolt.display_name},
              ${detail.submolt?.subscriber_count || submolt.subscriber_count}, ${postCount}, 
              ${totalUpvotes}, ${totalDownvotes}, ${totalComments}
            )
          `;
        }
        
        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 200));
      } catch (err) {
        console.error(`Error fetching submolt ${submolt.name}:`, err);
      }
    }

    // 4. Fetch top posts and store snapshots
    const topPostsRes = await fetch(`${MOLTBOOK_API}/posts?limit=20&sort=top`);
    const topPostsData = await topPostsRes.json();
    const topPosts: Post[] = topPostsData.posts || [];

    for (let i = 0; i < topPosts.length; i++) {
      const post = topPosts[i];
      await sql`
        INSERT INTO top_posts_snapshots (
          captured_at, post_id, title, submolt_name, upvotes, downvotes, comment_count, rank
        ) VALUES (
          NOW(), ${post.id}, ${post.title?.substring(0, 500)}, ${(post as any).submolt?.name || null},
          ${post.upvotes}, ${post.downvotes}, ${post.comment_count}, ${i + 1}
        )
      `;
    }

    const duration = (Date.now() - startTime) / 1000;

    return NextResponse.json({
      success: true,
      duration: `${duration.toFixed(1)}s`,
      globalStats: {
        agents: statsData.agents,
        submolts: statsData.submolts,
        posts: statsData.posts,
        comments: statsData.comments
      },
      submoltsCollected: submoltStats.length,
      topPostsCollected: topPosts.length,
      topSubmolts: submoltStats.slice(0, 5).map(s => ({
        name: s.name,
        subscribers: s.subscriber_count,
        posts: s.post_count,
        upvotes: s.total_upvotes
      }))
    });
  } catch (error) {
    console.error('Full cron error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function POST() {
  return GET();
}
