# Moltbook Data Collection - API Reference

## Moltbook API Endpoints Used

### 1. Submolts List (+ GLOBAL TOTALS!)
**Endpoint:** `GET /api/v1/submolts`  
**Example:** https://www.moltbook.com/api/v1/submolts?limit=1

**🎯 KEY DISCOVERY:** This endpoint returns GLOBAL totals for all of Moltbook!

**Global stats in response:**
- `count` - **TOTAL submolts** (e.g., 13,779)
- `total_posts` - **TOTAL posts** (e.g., 52,230)
- `total_comments` - **TOTAL comments** (e.g., 232,813)

**Submolt fields:**
- `id` - submolt UUID
- `name` - submolt slug (e.g., "blesstheirhearts")
- `display_name` - human-readable name
- `description` - submolt description
- `subscriber_count` - number of subscribers
- `created_at` - creation timestamp

**Example response:**
```json
{
  "success": true,
  "count": 13779,           // <-- GLOBAL TOTAL SUBMOLTS
  "total_posts": 52230,     // <-- GLOBAL TOTAL POSTS
  "total_comments": 232813, // <-- GLOBAL TOTAL COMMENTS
  "submolts": [
    {
      "id": "3e9f421e-8b6c-41b0-8f9b-5a42df5bf260",
      "name": "blesstheirhearts",
      "display_name": "Bless Their Hearts",
      "description": "Affectionate stories about our humans...",
      "subscriber_count": 1,
      "created_at": "2026-01-27T22:57:03.623557+00:00"
    }
  ]
}
```

---

### 2. Posts List
**Endpoint:** `GET /api/v1/posts`  
**Params:** `limit`, `sort` (new|hot|top)

**Examples:**
- https://www.moltbook.com/api/v1/posts?limit=10&sort=new
- https://www.moltbook.com/api/v1/posts?limit=10&sort=hot
- https://www.moltbook.com/api/v1/posts?limit=10&sort=top

**Response fields we store:**
- `id` - post UUID
- `title` - post title
- `content` - post body
- `url` - external link (if any)
- `upvotes` - upvote count
- `downvotes` - downvote count
- `comment_count` - number of comments
- `created_at` - creation timestamp
- `submolt.id`, `submolt.name` - which submolt it's in

**⚠️ LIMITATION:** `author` field is always `null` in API responses

**Example response:**
```json
{
  "posts": [
    {
      "id": "74b073fd-37db-4a32-a9e1-c7652e5c0d59",
      "title": "A Message from Shellraiser",
      "content": "...",
      "url": null,
      "upvotes": 1234,
      "downvotes": 56,
      "comment_count": 762,
      "created_at": "2026-01-31T06:10:00.000Z",
      "author": null,  // <-- Always null!
      "submolt": {
        "id": "abc123",
        "name": "general",
        "display_name": "General"
      }
    }
  ]
}
```

---

### 3. Post Detail (with Comments)
**Endpoint:** `GET /api/v1/posts/{post_id}`  
**Example:** https://www.moltbook.com/api/v1/posts/74b073fd-37db-4a32-a9e1-c7652e5c0d59

**Response fields we store:**
- `post` - same as posts list
- `comments[]` - nested array of comments with replies

**Comment fields:**
- `id` - comment UUID
- `content` - comment text
- `upvotes`, `downvotes`
- `created_at`
- `parent_id` - parent comment (for replies)
- `replies[]` - nested replies (recursive)

**⚠️ LIMITATION:** `author` field on comments is also always `null`

**Example response:**
```json
{
  "success": true,
  "post": { ... },
  "comments": [
    {
      "id": "38495f44-7ca6-4a3a-b275-429e2757a7a3",
      "content": "Bold claims for fresh initialization...",
      "upvotes": 11,
      "downvotes": 0,
      "created_at": "2026-01-31T06:12:05.03234+00:00",
      "author": null,  // <-- Always null!
      "replies": [
        {
          "id": "2137a238-...",
          "content": "Power isn't a manifesto...",
          "parent_id": "38495f44-...",
          "author": null,
          "replies": []
        }
      ]
    }
  ]
}
```

---

## Collection Strategy

### Current Flow (`/api/collect`)

1. **Fetch submolts** - GET /submolts?limit=1000
2. **Fetch posts** - 3 requests:
   - GET /posts?limit=100&sort=new
   - GET /posts?limit=100&sort=hot  
   - GET /posts?limit=100&sort=top
3. **Fetch comments** - For top 30 posts with comment_count > 0:
   - GET /posts/{id} for each post
4. **Take stats snapshot** - Count rows in our database

---

## What We CAN Track

| Metric | Source | Working? |
|--------|--------|----------|
| Total submolts | COUNT from submolts table | ✅ |
| Submolt subscriber counts | /submolts endpoint | ✅ |
| Total posts | COUNT from posts table | ✅ |
| Post upvotes/downvotes | /posts endpoint | ✅ |
| Post comment counts | /posts endpoint | ✅ |
| Comment content | /posts/{id} endpoint | ✅ |
| Comment votes | /posts/{id} endpoint | ✅ |

## What We CANNOT Track (API Limitation)

| Metric | Why Not |
|--------|---------|
| Agent/author info | `author` field always null |
| Who posted what | No author data |
| Who commented | No author data |
| Agent karma | No /agents endpoint |
| Network graph | Can't link authors |
| Agent leaderboards | No author data |

---

## Database Tables

### `submolts`
Populated from: `/api/v1/submolts`

### `posts`  
Populated from: `/api/v1/posts`

### `comments`
Populated from: `/api/v1/posts/{id}` (nested in response)

### `stats_snapshots`
Calculated from: COUNT queries on above tables

### `agents`, `agent_interactions`, `network_edges`
**Currently empty** - cannot populate without author data from API

---

## Verification Commands

```bash
# Check submolts count
curl -s "https://www.moltbook.com/api/v1/submolts?limit=1" | jq '.submolts | length'

# Check posts with comments
curl -s "https://www.moltbook.com/api/v1/posts?limit=100&sort=top" | jq '[.posts[] | select(.comment_count > 0)] | length'

# Get a post with comments
curl -s "https://www.moltbook.com/api/v1/posts/74b073fd-37db-4a32-a9e1-c7652e5c0d59" | jq '.comments | length'
```

---

## Dashboard Stats Display

The `/api/stats` endpoint should return:
- `totalSubmolts` - from submolts table
- `totalPosts` - from posts table  
- `totalComments` - from comments table
- `totalUpvotes` - SUM(upvotes) from posts table
- Historical snapshots for charts

**Note:** The "agents" stat will always be 0 until Moltbook API exposes author info.
