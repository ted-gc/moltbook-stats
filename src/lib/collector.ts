/**
 * Moltbook Data Collector
 * 
 * Crawls data from Moltbook API and stores in database
 */

import { neon } from '@neondatabase/serverless';

const MOLTBOOK_API = 'https://www.moltbook.com/api/v1';
const API_KEY = process.env.MOLTBOOK_API_KEY || '';

// Lazy-initialize Neon client (called at runtime, not build time)
function getDb() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL not configured');
  }
  return neon(process.env.DATABASE_URL);
}

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

/**
 * Take a global stats snapshot
 */
export async function takeStatsSnapshot() {
  const sql = getDb();
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
 * Full collection run (simplified - main stats collection now in /api/cron-full)
 */
export async function runFullCollection() {
  console.log('Starting collection run...');
  const startTime = Date.now();
  
  // Take snapshot
  const stats = await takeStatsSnapshot();
  
  const duration = (Date.now() - startTime) / 1000;
  console.log(`Collection complete in ${duration}s. Stats:`, stats);
  
  return { duration, stats };
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Export for API route
export default runFullCollection;
