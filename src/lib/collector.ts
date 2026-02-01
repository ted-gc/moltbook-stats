/**
 * Moltbook Data Collector
 * 
 * Crawls ALL data from Moltbook API and stores in database
 * - Posts with full content
 * - Comments and replies
 * - Agent interactions (who replied to whom)
 * - Upvote/downvote deltas
 * - Network edge updates
 */

import { neon } from '@neondatabase/serverless';

const MOLTBOOK_API = 'https://www.moltbook.com/api/v1';
const API_KEY = process.env.MOLTBOOK_API_KEY!;

// Initialize Neon client
const sql = neon(process.env.DATABASE_URL!);

interface MoltbookPost {
  id: string;
  title: string;
  content: string;
  url: string | null;
  upvotes: number;
  downvotes: number;
  comment_count: number;
  created_at: string;
  author: { id: string; name: string } | null;
  submolt: { id: string; name: string; display_name: string } | null;
}

interface MoltbookComment {
  id: string;
  content: string;
  upvotes: number;
  downvotes: number;
  created_at: string;
  parent_id: string | null;
  author: { id: string; name: string } | null;
}

interface MoltbookSubmolt {
  id: string;
  name: string;
  display_name: string;
  description: string;
  subscriber_count: number;
  post_count?: number;
  created_at: string;
}

// Fetch with auth
async function fetchMoltbook(endpoint: string, params: Record<string, string> = {}) {
  const url = new URL(`${MOLTBOOK_API}${endpoint}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  
  const response = await fetch(url.toString(), {
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    }
  });
  
  if (!response.ok) {
    throw new Error(`Moltbook API error: ${response.status}`);
  }
  
  return response.json();
}

// ============================================
// COLLECTORS
// ============================================

/**
 * Collect all submolts
 */
export async function collectSubmolts() {
  console.log('Collecting submolts...');
  const data = await fetchMoltbook('/submolts', { limit: '1000' });
  
  for (const submolt of data.submolts as MoltbookSubmolt[]) {
    await sql`
      INSERT INTO submolts (id, name, display_name, description, subscriber_count, created_at, last_updated_at)
      VALUES (${submolt.id}, ${submolt.name}, ${submolt.display_name}, ${submolt.description}, 
              ${submolt.subscriber_count}, ${submolt.created_at}, NOW())
      ON CONFLICT (id) DO UPDATE SET
        subscriber_count = EXCLUDED.subscriber_count,
        last_updated_at = NOW()
    `;
  }
  
  console.log(`Collected ${data.submolts.length} submolts`);
  return data.submolts.length;
}

/**
 * Collect recent posts
 */
export async function collectPosts(limit = 100, sort = 'new') {
  console.log(`Collecting ${limit} ${sort} posts...`);
  const data = await fetchMoltbook('/posts', { limit: limit.toString(), sort });
  
  for (const post of data.posts as MoltbookPost[]) {
    // Upsert agent if present
    if (post.author) {
      await sql`
        INSERT INTO agents (id, name, first_seen_at, last_updated_at)
        VALUES (${post.author.id}, ${post.author.name}, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          last_updated_at = NOW()
      `;
    }
    
    // Upsert submolt if present
    if (post.submolt) {
      await sql`
        INSERT INTO submolts (id, name, display_name, first_seen_at, last_updated_at)
        VALUES (${post.submolt.id}, ${post.submolt.name}, ${post.submolt.display_name}, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          display_name = EXCLUDED.display_name,
          last_updated_at = NOW()
      `;
    }
    
    // Check if post exists and track score changes
    const existing = await sql`SELECT upvotes, downvotes, comment_count FROM posts WHERE id = ${post.id}`;
    
    if (existing.length > 0) {
      const old = existing[0];
      // Record score history if changed
      if (old.upvotes !== post.upvotes || old.downvotes !== post.downvotes || old.comment_count !== post.comment_count) {
        await sql`
          INSERT INTO post_score_history (post_id, upvotes, downvotes, comment_count)
          VALUES (${post.id}, ${post.upvotes}, ${post.downvotes}, ${post.comment_count})
        `;
      }
    }
    
    // Upsert post
    await sql`
      INSERT INTO posts (id, title, content, url, author_id, submolt_id, upvotes, downvotes, comment_count, created_at, last_updated_at)
      VALUES (${post.id}, ${post.title}, ${post.content}, ${post.url}, ${post.author?.id}, ${post.submolt?.id},
              ${post.upvotes}, ${post.downvotes}, ${post.comment_count}, ${post.created_at}, NOW())
      ON CONFLICT (id) DO UPDATE SET
        upvotes = EXCLUDED.upvotes,
        downvotes = EXCLUDED.downvotes,
        comment_count = EXCLUDED.comment_count,
        last_updated_at = NOW()
    `;
  }
  
  console.log(`Collected ${data.posts.length} posts`);
  return data.posts;
}

/**
 * Collect comments for a post and build interaction graph
 */
export async function collectCommentsForPost(postId: string) {
  try {
    const data = await fetchMoltbook(`/posts/${postId}/comments`, { limit: '500' });
    const post = await sql`SELECT author_id FROM posts WHERE id = ${postId}`;
    const postAuthorId = post[0]?.author_id;
    
    for (const comment of (data.comments || []) as MoltbookComment[]) {
      // Upsert commenter
      if (comment.author) {
        await sql`
          INSERT INTO agents (id, name, first_seen_at, last_updated_at)
          VALUES (${comment.author.id}, ${comment.author.name}, NOW(), NOW())
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            last_updated_at = NOW()
        `;
      }
      
      // Upsert comment
      await sql`
        INSERT INTO comments (id, post_id, parent_comment_id, author_id, content, upvotes, downvotes, created_at, last_updated_at)
        VALUES (${comment.id}, ${postId}, ${comment.parent_id}, ${comment.author?.id}, ${comment.content},
                ${comment.upvotes}, ${comment.downvotes}, ${comment.created_at}, NOW())
        ON CONFLICT (id) DO UPDATE SET
          upvotes = EXCLUDED.upvotes,
          downvotes = EXCLUDED.downvotes,
          last_updated_at = NOW()
      `;
      
      // Record interaction: commenter -> post author
      if (comment.author?.id && postAuthorId && comment.author.id !== postAuthorId) {
        await sql`
          INSERT INTO agent_interactions (from_agent_id, to_agent_id, interaction_type, post_id, comment_id)
          VALUES (${comment.author.id}, ${postAuthorId}, 'comment_on_post', ${postId}, ${comment.id})
          ON CONFLICT DO NOTHING
        `;
        
        // Update network edge
        await sql`
          INSERT INTO network_edges (from_agent_id, to_agent_id, edge_weight, last_interaction_at)
          VALUES (${comment.author.id}, ${postAuthorId}, 1, NOW())
          ON CONFLICT (from_agent_id, to_agent_id) DO UPDATE SET
            edge_weight = network_edges.edge_weight + 1,
            last_interaction_at = NOW()
        `;
      }
      
      // If reply to another comment, record that interaction too
      if (comment.parent_id && comment.author?.id) {
        const parentComment = await sql`SELECT author_id FROM comments WHERE id = ${comment.parent_id}`;
        const parentAuthorId = parentComment[0]?.author_id;
        
        if (parentAuthorId && comment.author.id !== parentAuthorId) {
          await sql`
            INSERT INTO agent_interactions (from_agent_id, to_agent_id, interaction_type, post_id, comment_id)
            VALUES (${comment.author.id}, ${parentAuthorId}, 'reply_to_comment', ${postId}, ${comment.id})
            ON CONFLICT DO NOTHING
          `;
          
          await sql`
            INSERT INTO network_edges (from_agent_id, to_agent_id, edge_weight, last_interaction_at)
            VALUES (${comment.author.id}, ${parentAuthorId}, 1, NOW())
            ON CONFLICT (from_agent_id, to_agent_id) DO UPDATE SET
              edge_weight = network_edges.edge_weight + 1,
              last_interaction_at = NOW()
          `;
        }
      }
    }
    
    return data.comments?.length || 0;
  } catch (error) {
    console.error(`Error collecting comments for post ${postId}:`, error);
    return 0;
  }
}

/**
 * Take a global stats snapshot
 */
export async function takeStatsSnapshot() {
  console.log('Taking stats snapshot...');
  
  const [agents, posts, comments, submolts] = await Promise.all([
    sql`SELECT COUNT(*) as count FROM agents`,
    sql`SELECT COUNT(*) as count, SUM(upvotes) as upvotes, SUM(downvotes) as downvotes FROM posts`,
    sql`SELECT COUNT(*) as count FROM comments`,
    sql`SELECT COUNT(*) as count FROM submolts`
  ]);
  
  await sql`
    INSERT INTO stats_snapshots (total_agents, total_posts, total_comments, total_submolts, total_upvotes, total_downvotes)
    VALUES (${agents[0].count}, ${posts[0].count}, ${comments[0].count}, ${submolts[0].count}, 
            ${posts[0].upvotes || 0}, ${posts[0].downvotes || 0})
  `;
  
  console.log('Stats snapshot saved');
  return {
    agents: agents[0].count,
    posts: posts[0].count,
    comments: comments[0].count,
    submolts: submolts[0].count
  };
}

/**
 * Update daily top posts
 */
export async function updateDailyTopPosts() {
  const today = new Date().toISOString().split('T')[0];
  
  await sql`
    INSERT INTO daily_top_posts (date, post_id, rank, upvotes, comment_count, score)
    SELECT 
      ${today}::date,
      id,
      ROW_NUMBER() OVER (ORDER BY (upvotes + comment_count * 2) DESC),
      upvotes,
      comment_count,
      upvotes + comment_count * 2
    FROM posts
    WHERE created_at > NOW() - INTERVAL '24 hours'
    ORDER BY (upvotes + comment_count * 2) DESC
    LIMIT 100
    ON CONFLICT (date, post_id) DO UPDATE SET
      rank = EXCLUDED.rank,
      upvotes = EXCLUDED.upvotes,
      comment_count = EXCLUDED.comment_count,
      score = EXCLUDED.score
  `;
}

/**
 * Full collection run
 */
export async function runFullCollection() {
  console.log('Starting full collection run...');
  const startTime = Date.now();
  
  // Collect submolts
  await collectSubmolts();
  
  // Collect recent posts (multiple pages)
  const allPosts: MoltbookPost[] = [];
  for (const sort of ['new', 'hot', 'top']) {
    const posts = await collectPosts(100, sort);
    allPosts.push(...posts);
    await sleep(1000); // Rate limiting
  }
  
  // Collect comments for posts with activity
  let commentsCollected = 0;
  for (const post of allPosts.slice(0, 50)) { // Top 50 posts
    if (post.comment_count > 0) {
      const count = await collectCommentsForPost(post.id);
      commentsCollected += count;
      await sleep(500); // Rate limiting
    }
  }
  
  // Take snapshot
  const stats = await takeStatsSnapshot();
  
  // Update daily rankings
  await updateDailyTopPosts();
  
  const duration = (Date.now() - startTime) / 1000;
  console.log(`Collection complete in ${duration}s. Stats:`, stats);
  
  return { duration, stats, postsCollected: allPosts.length, commentsCollected };
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Export for API route
export default runFullCollection;
