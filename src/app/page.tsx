'use client';

import { useEffect, useState } from 'react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  LineChart,
  Line
} from 'recharts';

interface Stats {
  current: {
    totalAgents: number;
    totalPosts: number;
    totalComments: number;
    totalSubmolts: number;
    totalUpvotes: number;
    totalDownvotes: number;
  };
  changes24h: {
    agents: number;
    posts: number;
    comments: number;
  } | null;
  lastSnapshot: string;
  history: Array<{
    timestamp: string;
    agents: number;
    posts: number;
    comments: number;
  }>;
}

function StatCard({ 
  title, 
  value, 
  change, 
  icon 
}: { 
  title: string; 
  value: number; 
  change?: number;
  icon: string;
}) {
  const formatNumber = (n: number) => {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toString();
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 hover:border-zinc-700 transition-colors">
      <div className="flex items-center justify-between mb-4">
        <span className="text-zinc-500 text-sm font-medium">{title}</span>
        <span className="text-2xl">{icon}</span>
      </div>
      <div className="flex items-end gap-2">
        <span className="text-3xl font-bold text-white">{formatNumber(value)}</span>
        {change !== undefined && (
          <span className={`text-sm font-medium ${change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {change >= 0 ? '+' : ''}{formatNumber(change)} (24h)
          </span>
        )}
      </div>
    </div>
  );
}

function PulseIndicator({ active }: { active: boolean }) {
  return (
    <div className="relative w-4 h-4">
      <div className={`absolute inset-0 rounded-full ${active ? 'bg-green-500' : 'bg-zinc-600'}`} />
      {active && (
        <div className="absolute inset-0 rounded-full bg-green-500 animate-ping opacity-75" />
      )}
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch('/api/stats');
        if (!res.ok) throw new Error('Failed to fetch stats');
        const data = await res.json();
        setStats(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
    const interval = setInterval(fetchStats, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white text-xl">Loading Moltbook Stats...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-500 text-xl mb-4">Error: {error}</div>
          <p className="text-zinc-500">Database may not be initialized. Run /api/setup first.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🦞</span>
            <div>
              <h1 className="text-xl font-bold">Moltbook Stats</h1>
              <p className="text-zinc-500 text-sm">The pulse of the agent internet</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-zinc-500 text-sm">
            <PulseIndicator active={!!stats} />
            <span>Live</span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard 
            title="Total Agents" 
            value={stats?.current.totalAgents || 0} 
            change={stats?.changes24h?.agents}
            icon="🤖"
          />
          <StatCard 
            title="Total Posts" 
            value={stats?.current.totalPosts || 0}
            change={stats?.changes24h?.posts}
            icon="📝"
          />
          <StatCard 
            title="Total Comments" 
            value={stats?.current.totalComments || 0}
            change={stats?.changes24h?.comments}
            icon="💬"
          />
          <StatCard 
            title="Submolts" 
            value={stats?.current.totalSubmolts || 0}
            icon="🏘️"
          />
        </div>

        {/* Activity Chart */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4">Activity Over Time</h2>
          {stats?.history && stats.history.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={stats.history}>
                <defs>
                  <linearGradient id="colorAgents" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorPosts" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis 
                  dataKey="timestamp" 
                  stroke="#71717a"
                  tickFormatter={(value) => new Date(value).toLocaleDateString()}
                />
                <YAxis stroke="#71717a" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#18181b', 
                    border: '1px solid #27272a',
                    borderRadius: '8px'
                  }}
                  labelFormatter={(value) => new Date(value).toLocaleString()}
                />
                <Area 
                  type="monotone" 
                  dataKey="agents" 
                  stroke="#10b981" 
                  fillOpacity={1} 
                  fill="url(#colorAgents)" 
                  name="Agents"
                />
                <Area 
                  type="monotone" 
                  dataKey="posts" 
                  stroke="#3b82f6" 
                  fillOpacity={1} 
                  fill="url(#colorPosts)" 
                  name="Posts"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-zinc-500">
              No historical data yet. Run /api/collect to start gathering data.
            </div>
          )}
        </div>

        {/* Engagement Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-4">Engagement</h2>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-zinc-500">Total Upvotes</span>
                <span className="text-white font-semibold">
                  {(stats?.current.totalUpvotes || 0).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-500">Total Downvotes</span>
                <span className="text-white font-semibold">
                  {(stats?.current.totalDownvotes || 0).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-500">Upvote Ratio</span>
                <span className="text-green-500 font-semibold">
                  {stats?.current.totalUpvotes && stats?.current.totalDownvotes
                    ? ((stats.current.totalUpvotes / (stats.current.totalUpvotes + stats.current.totalDownvotes)) * 100).toFixed(1) + '%'
                    : 'N/A'
                  }
                </span>
              </div>
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-4">Data Collection</h2>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-zinc-500">Last Snapshot</span>
                <span className="text-white font-semibold">
                  {stats?.lastSnapshot 
                    ? new Date(stats.lastSnapshot).toLocaleString()
                    : 'Never'
                  }
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-500">History Points</span>
                <span className="text-white font-semibold">
                  {stats?.history?.length || 0}
                </span>
              </div>
              <a 
                href="/api/collect" 
                className="block w-full text-center bg-zinc-800 hover:bg-zinc-700 py-2 px-4 rounded-lg transition-colors"
              >
                Trigger Collection
              </a>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-12 pt-8 border-t border-zinc-800 text-center text-zinc-500 text-sm">
          <p>Built by <a href="https://github.com/ted-gc" className="text-white hover:underline">Ted</a> 🦞</p>
          <p className="mt-1">Data from <a href="https://moltbook.com" className="text-white hover:underline">Moltbook</a></p>
        </footer>
      </main>
    </div>
  );
}
