-- Moltbook Stats - Comprehensive Database Schema
-- Captures ALL data for network analysis and trend detection

-- ============================================
-- CORE ENTITIES
-- ============================================

-- Agents (all registered agents)
CREATE TABLE agents (
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
);

-- Submolts (communities)
CREATE TABLE submolts (
  id VARCHAR(100) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  display_name VARCHAR(200),
  description TEXT,
  subscriber_count INTEGER DEFAULT 0,
  post_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ,
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Posts (all posts)
CREATE TABLE posts (
  id VARCHAR(100) PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT,
  url TEXT,
  author_id VARCHAR(100) REFERENCES agents(id),
  submolt_id VARCHAR(100) REFERENCES submolts(id),
  upvotes INTEGER DEFAULT 0,
  downvotes INTEGER DEFAULT 0,
  comment_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ,
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Comments (all comments)
CREATE TABLE comments (
  id VARCHAR(100) PRIMARY KEY,
  post_id VARCHAR(100) REFERENCES posts(id),
  parent_comment_id VARCHAR(100) REFERENCES comments(id),
  author_id VARCHAR(100) REFERENCES agents(id),
  content TEXT,
  upvotes INTEGER DEFAULT 0,
  downvotes INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ,
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INTERACTIONS (for network analysis)
-- ============================================

-- Agent-to-Agent interactions derived from comments
-- (who replied to whom)
CREATE TABLE agent_interactions (
  id SERIAL PRIMARY KEY,
  from_agent_id VARCHAR(100) REFERENCES agents(id),
  to_agent_id VARCHAR(100) REFERENCES agents(id),
  interaction_type VARCHAR(50) NOT NULL, -- 'comment_on_post', 'reply_to_comment', 'upvote', 'follow'
  post_id VARCHAR(100) REFERENCES posts(id),
  comment_id VARCHAR(100) REFERENCES comments(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(from_agent_id, to_agent_id, interaction_type, post_id, comment_id)
);

-- ============================================
-- HISTORICAL SNAPSHOTS (for timelines)
-- ============================================

-- Global stats snapshots (every 15 min)
CREATE TABLE stats_snapshots (
  id SERIAL PRIMARY KEY,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_agents INTEGER NOT NULL,
  total_posts INTEGER NOT NULL,
  total_comments INTEGER NOT NULL,
  total_submolts INTEGER NOT NULL,
  total_upvotes BIGINT,
  total_downvotes BIGINT
);

-- Agent karma history (for tracking karma changes)
CREATE TABLE agent_karma_history (
  id SERIAL PRIMARY KEY,
  agent_id VARCHAR(100) REFERENCES agents(id),
  karma INTEGER NOT NULL,
  post_count INTEGER,
  comment_count INTEGER,
  captured_at TIMESTAMPTZ DEFAULT NOW()
);

-- Post score history (for tracking viral posts)
CREATE TABLE post_score_history (
  id SERIAL PRIMARY KEY,
  post_id VARCHAR(100) REFERENCES posts(id),
  upvotes INTEGER NOT NULL,
  downvotes INTEGER NOT NULL,
  comment_count INTEGER NOT NULL,
  captured_at TIMESTAMPTZ DEFAULT NOW()
);

-- Submolt growth history
CREATE TABLE submolt_history (
  id SERIAL PRIMARY KEY,
  submolt_id VARCHAR(100) REFERENCES submolts(id),
  subscriber_count INTEGER NOT NULL,
  post_count INTEGER NOT NULL,
  captured_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- DERIVED/AGGREGATED DATA
-- ============================================

-- Hourly aggregates for efficient queries
CREATE TABLE hourly_aggregates (
  id SERIAL PRIMARY KEY,
  hour TIMESTAMPTZ NOT NULL,
  metric VARCHAR(50) NOT NULL,
  value BIGINT NOT NULL,
  UNIQUE(hour, metric)
);

-- Daily top posts (for trending)
CREATE TABLE daily_top_posts (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  post_id VARCHAR(100) REFERENCES posts(id),
  rank INTEGER NOT NULL,
  upvotes INTEGER,
  comment_count INTEGER,
  score FLOAT, -- calculated engagement score
  UNIQUE(date, post_id)
);

-- Daily top agents
CREATE TABLE daily_top_agents (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  agent_id VARCHAR(100) REFERENCES agents(id),
  rank INTEGER NOT NULL,
  karma INTEGER,
  karma_gained INTEGER, -- delta from previous day
  UNIQUE(date, agent_id)
);

-- Network edges (aggregated for visualization)
CREATE TABLE network_edges (
  id SERIAL PRIMARY KEY,
  from_agent_id VARCHAR(100) REFERENCES agents(id),
  to_agent_id VARCHAR(100) REFERENCES agents(id),
  edge_weight INTEGER DEFAULT 1, -- number of interactions
  last_interaction_at TIMESTAMPTZ,
  UNIQUE(from_agent_id, to_agent_id)
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_posts_author ON posts(author_id);
CREATE INDEX idx_posts_submolt ON posts(submolt_id);
CREATE INDEX idx_posts_created ON posts(created_at);
CREATE INDEX idx_posts_upvotes ON posts(upvotes DESC);

CREATE INDEX idx_comments_post ON comments(post_id);
CREATE INDEX idx_comments_author ON comments(author_id);
CREATE INDEX idx_comments_created ON comments(created_at);

CREATE INDEX idx_interactions_from ON agent_interactions(from_agent_id);
CREATE INDEX idx_interactions_to ON agent_interactions(to_agent_id);
CREATE INDEX idx_interactions_created ON agent_interactions(created_at);

CREATE INDEX idx_stats_time ON stats_snapshots(captured_at);
CREATE INDEX idx_karma_history_agent ON agent_karma_history(agent_id, captured_at);
CREATE INDEX idx_post_history ON post_score_history(post_id, captured_at);

CREATE INDEX idx_network_from ON network_edges(from_agent_id);
CREATE INDEX idx_network_to ON network_edges(to_agent_id);

-- ============================================
-- USEFUL VIEWS
-- ============================================

-- View: Current network edges with agent names
CREATE VIEW network_graph AS
SELECT 
  ne.from_agent_id,
  a1.name as from_agent_name,
  ne.to_agent_id,
  a2.name as to_agent_name,
  ne.edge_weight,
  ne.last_interaction_at
FROM network_edges ne
JOIN agents a1 ON ne.from_agent_id = a1.id
JOIN agents a2 ON ne.to_agent_id = a2.id
WHERE ne.edge_weight > 0;

-- View: Trending posts (last 24h by engagement velocity)
CREATE VIEW trending_posts AS
SELECT 
  p.id,
  p.title,
  p.author_id,
  a.name as author_name,
  p.upvotes,
  p.comment_count,
  p.created_at,
  (p.upvotes + p.comment_count * 2) / 
    GREATEST(1, EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600) as velocity
FROM posts p
LEFT JOIN agents a ON p.author_id = a.id
WHERE p.created_at > NOW() - INTERVAL '24 hours'
ORDER BY velocity DESC;

-- View: Most connected agents
CREATE VIEW agent_connectivity AS
SELECT 
  a.id,
  a.name,
  a.karma,
  COALESCE(outgoing.cnt, 0) as interactions_out,
  COALESCE(incoming.cnt, 0) as interactions_in,
  COALESCE(outgoing.cnt, 0) + COALESCE(incoming.cnt, 0) as total_connections
FROM agents a
LEFT JOIN (
  SELECT from_agent_id, SUM(edge_weight) as cnt 
  FROM network_edges GROUP BY from_agent_id
) outgoing ON a.id = outgoing.from_agent_id
LEFT JOIN (
  SELECT to_agent_id, SUM(edge_weight) as cnt 
  FROM network_edges GROUP BY to_agent_id
) incoming ON a.id = incoming.to_agent_id
ORDER BY total_connections DESC;
