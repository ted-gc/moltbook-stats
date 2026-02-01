import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    if (!process.env.DATABASE_URL) {
      return NextResponse.json({ 
        success: false,
        error: 'DATABASE_URL not configured. Add Neon Postgres integration in Vercel first.' 
      }, { status: 500 });
    }
    
    const sql = neon(process.env.DATABASE_URL);
    
    // Create tables
    const statements = [
      // Agents
      `CREATE TABLE IF NOT EXISTS agents (
        id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        karma INTEGER DEFAULT 0,
        post_count INTEGER DEFAULT 0,
        comment_count INTEGER DEFAULT 0,
        follower_count INTEGER DEFAULT 0,
        following_count INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ,
        first_seen_at TIMESTAMPTZ DEFAULT NOW(),
        last_updated_at TIMESTAMPTZ DEFAULT NOW()
      )`,
      
      // Submolts
      `CREATE TABLE IF NOT EXISTS submolts (
        id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        display_name VARCHAR(200),
        description TEXT,
        subscriber_count INTEGER DEFAULT 0,
        post_count INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ,
        first_seen_at TIMESTAMPTZ DEFAULT NOW(),
        last_updated_at TIMESTAMPTZ DEFAULT NOW()
      )`,
      
      // Posts
      `CREATE TABLE IF NOT EXISTS posts (
        id VARCHAR(100) PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT,
        url TEXT,
        author_id VARCHAR(100),
        submolt_id VARCHAR(100),
        upvotes INTEGER DEFAULT 0,
        downvotes INTEGER DEFAULT 0,
        comment_count INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ,
        first_seen_at TIMESTAMPTZ DEFAULT NOW(),
        last_updated_at TIMESTAMPTZ DEFAULT NOW()
      )`,
      
      // Comments
      `CREATE TABLE IF NOT EXISTS comments (
        id VARCHAR(100) PRIMARY KEY,
        post_id VARCHAR(100),
        parent_comment_id VARCHAR(100),
        author_id VARCHAR(100),
        content TEXT,
        upvotes INTEGER DEFAULT 0,
        downvotes INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ,
        first_seen_at TIMESTAMPTZ DEFAULT NOW(),
        last_updated_at TIMESTAMPTZ DEFAULT NOW()
      )`,
      
      // Agent interactions
      `CREATE TABLE IF NOT EXISTS agent_interactions (
        id SERIAL PRIMARY KEY,
        from_agent_id VARCHAR(100),
        to_agent_id VARCHAR(100),
        interaction_type VARCHAR(50) NOT NULL,
        post_id VARCHAR(100),
        comment_id VARCHAR(100),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(from_agent_id, to_agent_id, interaction_type, post_id, comment_id)
      )`,
      
      // Stats snapshots
      `CREATE TABLE IF NOT EXISTS stats_snapshots (
        id SERIAL PRIMARY KEY,
        captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        total_agents INTEGER NOT NULL,
        total_posts INTEGER NOT NULL,
        total_comments INTEGER NOT NULL,
        total_submolts INTEGER NOT NULL,
        total_upvotes BIGINT,
        total_downvotes BIGINT
      )`,
      
      // Agent karma history
      `CREATE TABLE IF NOT EXISTS agent_karma_history (
        id SERIAL PRIMARY KEY,
        agent_id VARCHAR(100),
        karma INTEGER NOT NULL,
        post_count INTEGER,
        comment_count INTEGER,
        captured_at TIMESTAMPTZ DEFAULT NOW()
      )`,
      
      // Post score history
      `CREATE TABLE IF NOT EXISTS post_score_history (
        id SERIAL PRIMARY KEY,
        post_id VARCHAR(100),
        upvotes INTEGER NOT NULL,
        downvotes INTEGER NOT NULL,
        comment_count INTEGER NOT NULL,
        captured_at TIMESTAMPTZ DEFAULT NOW()
      )`,
      
      // Network edges
      `CREATE TABLE IF NOT EXISTS network_edges (
        id SERIAL PRIMARY KEY,
        from_agent_id VARCHAR(100),
        to_agent_id VARCHAR(100),
        edge_weight INTEGER DEFAULT 1,
        last_interaction_at TIMESTAMPTZ,
        UNIQUE(from_agent_id, to_agent_id)
      )`,
      
      // Submolt snapshots (per-submolt stats over time)
      `CREATE TABLE IF NOT EXISTS submolt_snapshots (
        id SERIAL PRIMARY KEY,
        captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        submolt_id VARCHAR(100) NOT NULL,
        submolt_name VARCHAR(100),
        display_name VARCHAR(200),
        subscriber_count INTEGER DEFAULT 0,
        post_count INTEGER DEFAULT 0,
        total_upvotes BIGINT DEFAULT 0,
        total_downvotes BIGINT DEFAULT 0,
        total_comments BIGINT DEFAULT 0
      )`,
      
      // Top posts snapshots
      `CREATE TABLE IF NOT EXISTS top_posts_snapshots (
        id SERIAL PRIMARY KEY,
        captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        post_id VARCHAR(100) NOT NULL,
        title TEXT,
        submolt_name VARCHAR(100),
        upvotes INTEGER DEFAULT 0,
        downvotes INTEGER DEFAULT 0,
        comment_count INTEGER DEFAULT 0,
        rank INTEGER
      )`,
      
      // Indexes for new tables
      `CREATE INDEX IF NOT EXISTS idx_submolt_snapshots_time ON submolt_snapshots(captured_at)`,
      `CREATE INDEX IF NOT EXISTS idx_submolt_snapshots_submolt ON submolt_snapshots(submolt_id)`,
      `CREATE INDEX IF NOT EXISTS idx_top_posts_snapshots_time ON top_posts_snapshots(captured_at)`,
      
      // Daily top posts
      `CREATE TABLE IF NOT EXISTS daily_top_posts (
        id SERIAL PRIMARY KEY,
        date DATE NOT NULL,
        post_id VARCHAR(100),
        rank INTEGER NOT NULL,
        upvotes INTEGER,
        comment_count INTEGER,
        score FLOAT,
        UNIQUE(date, post_id)
      )`,
      
      // Migration: add missing unique constraints to existing tables
      `DO $$ BEGIN
        ALTER TABLE agent_interactions ADD CONSTRAINT agent_interactions_unique 
          UNIQUE(from_agent_id, to_agent_id, interaction_type, post_id, comment_id);
      EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
      `DO $$ BEGIN
        ALTER TABLE daily_top_posts ADD CONSTRAINT daily_top_posts_unique 
          UNIQUE(date, post_id);
      EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
      
      // Indexes
      `CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(author_id)`,
      `CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at)`,
      `CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id)`,
      `CREATE INDEX IF NOT EXISTS idx_comments_author ON comments(author_id)`,
      `CREATE INDEX IF NOT EXISTS idx_stats_time ON stats_snapshots(captured_at)`,
      `CREATE INDEX IF NOT EXISTS idx_network_from ON network_edges(from_agent_id)`,
      `CREATE INDEX IF NOT EXISTS idx_network_to ON network_edges(to_agent_id)`
    ];
    
    const results = [];
    for (const statement of statements) {
      try {
        await sql.transaction([sql`${sql.unsafe(statement)}`]);
        results.push({ status: 'ok', statement: statement.substring(0, 50) + '...' });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        // Ignore "already exists" errors
        if (!message.includes('already exists')) {
          results.push({ status: 'error', error: message, statement: statement.substring(0, 50) + '...' });
        } else {
          results.push({ status: 'exists', statement: statement.substring(0, 50) + '...' });
        }
      }
    }
    
    return NextResponse.json({ 
      success: true, 
      message: 'Database schema initialized',
      results 
    });
  } catch (error) {
    console.error('Setup error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}
