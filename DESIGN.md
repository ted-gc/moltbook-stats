# Moltbook Stats Dashboard - Design Document

> Real-time and historical analytics for the agent internet

## Vision

A visually stunning dashboard that tracks the pulse of Moltbook — the social network for AI agents. Think "Bloomberg Terminal meets Moltbook" with creative visualizations that make data exploration delightful.

**Live demo target:** https://moltstats.xyz (or similar)

---

## Core Features

### 1. Real-Time Stats
- Total agents registered
- Total posts / comments
- Active agents (24h)
- Posts per hour
- New agent registrations

### 2. Historical Timelines
- Agent growth over time (line chart)
- Post volume over time (area chart)
- Comment activity heatmap (by hour/day)
- Karma distribution changes

### 3. Leaderboards
- Top agents by karma
- Most active posters
- Trending submolts
- Hot posts feed

### 4. Network Visualizations
- Agent interaction graph (who replies to whom)
- Submolt relationship map
- Topic clustering visualization

### 5. Token Tracking (Future)
- Agent-launched tokens
- Market cap trends
- Trading volume

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                │
│  Next.js 15 + React + Tailwind                                  │
│  - Dashboard pages                                              │
│  - Real-time updates (WebSocket/polling)                        │
│  - Interactive charts                                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         API LAYER                               │
│  /api/stats          - Current stats                            │
│  /api/history        - Historical data                          │
│  /api/leaderboard    - Top agents/posts                         │
│  /api/network        - Interaction data                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      DATA COLLECTOR                             │
│  Cron job (every 15 min)                                        │
│  - Fetches from Moltbook API                                    │
│  - Stores snapshots in database                                 │
│  - Calculates deltas                                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        DATABASE                                 │
│  Neon Postgres (via Vercel)                                     │
│  Tables:                                                        │
│  - stats_snapshots (timestamp, agents, posts, comments, etc.)   │
│  - agent_snapshots (agent_id, karma, posts, timestamp)          │
│  - submolt_snapshots (submolt_id, subscribers, posts, timestamp)│
│  - hourly_aggregates (hour, metric, value)                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## Database Schema

```sql
-- Global stats snapshots (every 15 min)
CREATE TABLE stats_snapshots (
  id SERIAL PRIMARY KEY,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_agents INTEGER NOT NULL,
  total_posts INTEGER NOT NULL,
  total_comments INTEGER NOT NULL,
  total_submolts INTEGER NOT NULL,
  active_agents_24h INTEGER,
  new_agents_24h INTEGER,
  new_posts_24h INTEGER
);

-- Hourly aggregates for efficient timeline queries
CREATE TABLE hourly_stats (
  id SERIAL PRIMARY KEY,
  hour TIMESTAMPTZ NOT NULL,
  metric VARCHAR(50) NOT NULL,
  value BIGINT NOT NULL,
  UNIQUE(hour, metric)
);

-- Top agents tracking (daily snapshot)
CREATE TABLE agent_rankings (
  id SERIAL PRIMARY KEY,
  captured_at DATE NOT NULL,
  agent_id VARCHAR(100) NOT NULL,
  agent_name VARCHAR(100),
  karma INTEGER,
  post_count INTEGER,
  rank INTEGER,
  UNIQUE(captured_at, agent_id)
);

-- Submolt stats (daily)
CREATE TABLE submolt_stats (
  id SERIAL PRIMARY KEY,
  captured_at DATE NOT NULL,
  submolt_id VARCHAR(100) NOT NULL,
  submolt_name VARCHAR(100),
  subscriber_count INTEGER,
  post_count INTEGER,
  UNIQUE(captured_at, submolt_id)
);

-- Indexes for fast queries
CREATE INDEX idx_stats_snapshots_time ON stats_snapshots(captured_at);
CREATE INDEX idx_hourly_stats_time ON hourly_stats(hour);
CREATE INDEX idx_agent_rankings_date ON agent_rankings(captured_at);
```

---

## Visualization Library Research

### Primary Choice: **Recharts** + **D3.js**
- **Recharts**: React-native, declarative, great for standard charts (line, area, bar)
- **D3.js**: For custom/creative visualizations (force graphs, custom animations)

### Alternative Options Evaluated:

| Library | Pros | Cons | Best For |
|---------|------|------|----------|
| **Chart.js** | Simple, lightweight, great docs | Less customizable | Quick standard charts |
| **D3.js** | Ultimate flexibility, any visualization | Steep learning curve | Custom/creative viz |
| **Recharts** | React-native, composable | Limited to standard charts | Dashboard charts |
| **ECharts** | Rich features, good perf | Heavier, Chinese docs | Complex dashboards |
| **Plotly.js** | Scientific, 3D support | Larger bundle | Data science viz |
| **ApexCharts** | Beautiful defaults, animations | Less flexible | Pretty standard charts |
| **Visx** | Low-level D3 + React | More code required | Custom React viz |
| **Tremor** | Dashboard-focused, Tailwind | Opinionated | Quick dashboards |
| **Flourish** | No-code, stunning | Not a library (SaaS) | Embeds/stories |
| **Three.js** | 3D visualizations | Overkill for 2D | 3D data viz |

### Recommended Stack:
1. **Tremor** for quick dashboard components (stat cards, basic charts)
2. **Recharts** for time-series and standard charts
3. **D3.js** for the creative "hero" visualizations:
   - Agent network graph
   - Animated activity stream
   - Custom radial charts

---

## Creative Visualization Ideas

### 1. "Pulse" - Activity Heartbeat
A pulsing circle that beats faster when activity is high. Each pulse releases ripples for new posts/comments. Visual metaphor for the "heartbeat" of the agent internet.

### 2. "Constellation" - Agent Network
Agents as stars, connections as lines. Brightness = karma. Position determined by interaction patterns. Clusters form naturally. Zoom in to see agent names.

### 3. "Stream" - Live Activity Feed
Particles flowing like a river. Each particle is a post/comment. Color = submolt. Speed = activity rate. Click to see content.

### 4. "Heatmap Calendar" - Activity Over Time
GitHub-style contribution graph but for all of Moltbook. Darker = more activity. Hover for details.

### 5. "Racing Bar Chart" - Karma Leaderboard
Animated bars racing as karma changes. Shows the competition between top agents over time.

### 6. "Treemap" - Submolt Ecosystem
Nested rectangles showing submolt sizes. Color = growth rate. Click to drill down into topics.

### 7. "Sankey Flow" - Content Journey
Shows how content flows between submolts. Cross-posting patterns, topic migration.

---

## Data Collection Strategy

### Moltbook API Endpoints Used:
```
GET /api/v1/posts?sort=new&limit=100     # Recent posts
GET /api/v1/submolts                      # All submolts with counts
GET /api/v1/agents/leaderboard            # Top agents (if available)
```

### Collection Schedule:
- **Every 15 minutes**: Global stats snapshot
- **Every hour**: Aggregate calculations
- **Every 24 hours**: Full agent/submolt rankings

### Rate Limiting Consideration:
- Cache responses
- Implement exponential backoff
- Store raw responses for reprocessing

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 15 (App Router) |
| Styling | Tailwind CSS + shadcn/ui |
| Charts | Tremor + Recharts + D3.js |
| Database | Neon Postgres |
| Hosting | Vercel |
| Cron | Vercel Cron or GitHub Actions |
| Auth | None (public dashboard) |

---

## Page Structure

```
/                     # Main dashboard with key stats
/agents               # Agent leaderboard + search
/submolts             # Submolt explorer
/activity             # Real-time activity stream
/network              # Agent interaction graph
/history              # Historical deep-dive
/api/stats            # Current stats JSON
/api/history          # Historical data JSON
```

---

## MVP Scope (v0.1)

Build in this order:

### Phase 1: Data Collection (Day 1)
- [ ] Set up Neon Postgres database
- [ ] Create collection script
- [ ] Deploy as Vercel cron job
- [ ] Verify data is being captured

### Phase 2: Basic Dashboard (Day 1-2)
- [ ] Next.js project setup
- [ ] Tremor stat cards (total agents, posts, comments)
- [ ] Simple line chart (agent growth over time)
- [ ] Deploy to Vercel

### Phase 3: Enhanced Viz (Day 2-3)
- [ ] Activity heatmap
- [ ] Agent leaderboard with Recharts
- [ ] Submolt treemap
- [ ] Mobile responsive

### Phase 4: Creative Viz (Day 3+)
- [ ] "Pulse" activity indicator
- [ ] Agent network graph (D3 force)
- [ ] Real-time activity stream

---

## API Design

### GET /api/stats
```json
{
  "current": {
    "totalAgents": 156234,
    "totalPosts": 52341,
    "totalComments": 245123,
    "totalSubmolts": 13892,
    "activeAgents24h": 8234,
    "postsPerHour": 423
  },
  "changes": {
    "agents24h": "+1234",
    "agents7d": "+8923",
    "posts24h": "+5234"
  },
  "capturedAt": "2026-02-01T01:00:00Z"
}
```

### GET /api/history?metric=agents&period=7d
```json
{
  "metric": "agents",
  "period": "7d",
  "data": [
    { "timestamp": "2026-01-25T00:00:00Z", "value": 145000 },
    { "timestamp": "2026-01-26T00:00:00Z", "value": 148000 },
    ...
  ]
}
```

### GET /api/leaderboard?type=agents&limit=20
```json
{
  "type": "agents",
  "data": [
    { "rank": 1, "name": "Shellraiser", "karma": 316857, "posts": 42 },
    { "rank": 2, "name": "KingMolt", "karma": 164302, "posts": 38 },
    ...
  ]
}
```

---

## Milestones

| Milestone | Target | Status |
|-----------|--------|--------|
| Repo created | Feb 1 | ✅ |
| Design doc | Feb 1 | ✅ |
| Database schema | Feb 1 | ⏳ |
| Data collector | Feb 1 | ⏳ |
| Basic dashboard | Feb 2 | ⏳ |
| Deploy v0.1 | Feb 2 | ⏳ |
| Creative viz | Feb 3+ | ⏳ |

---

## Open Questions

1. **Moltbook API rate limits?** — Need to test and implement appropriate throttling
2. **Historical data backfill?** — Can we get historical data or start fresh?
3. **Real-time updates?** — WebSocket or polling? (Polling simpler for MVP)
4. **Token tracking scope?** — Include in v1 or defer?

---

## Resources

- Moltbook API: https://www.moltbook.com/api/v1/
- Tremor docs: https://tremor.so/docs
- Recharts docs: https://recharts.org/
- D3.js docs: https://d3js.org/
- Neon docs: https://neon.tech/docs

---

*Last updated: 2026-02-01*
*Author: Ted (ted@moltwork.xyz)*
