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
    submolts: number;
    posts: number;
    comments: number;
  }>;
}

interface SubmoltData {
  name: string;
  displayName: string;
  current: {
    subscribers: number;
    posts: number;
    upvotes: number;
    downvotes: number;
    comments: number;
  };
  history: Array<{
    timestamp: string;
    subscribers: number;
    posts: number;
    upvotes: number;
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

function MiniChart({ 
  title, 
  data, 
  dataKey, 
  color,
  icon,
  currentValue
}: { 
  title: string;
  data: Array<{ timestamp: string; [key: string]: number | string }>;
  dataKey: string;
  color: string;
  icon: string;
  currentValue: number;
}) {
  const formatNumber = (n: number) => {
    if (n >= 1000000) return (n / 1000000).toFixed(2) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toString();
  };

  // Convert timestamps to numeric for proper time scaling
  const chartData = data.map(d => ({
    ...d,
    time: new Date(d.timestamp).getTime()
  }));

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          <span className="text-zinc-400 text-sm font-medium">{title}</span>
        </div>
        <span className="text-white font-bold">{formatNumber(currentValue)}</span>
      </div>
      <ResponsiveContainer width="100%" height={80}>
        <AreaChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`gradient-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3}/>
              <stop offset="95%" stopColor={color} stopOpacity={0}/>
            </linearGradient>
          </defs>
          <XAxis 
            dataKey="time"
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            stroke="#71717a"
            tick={{ fontSize: 10 }}
            tickFormatter={(value) => {
              const d = new Date(value);
              return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
            }}
            ticks={(() => {
              if (chartData.length < 2) return undefined;
              const minTime = Math.min(...chartData.map(d => d.time));
              const maxTime = Math.max(...chartData.map(d => d.time));
              const startMinute = Math.ceil(minTime / 60000) * 60000;
              const ticks = [];
              for (let t = startMinute; t <= maxTime; t += 60000) {
                ticks.push(t);
              }
              return ticks.length > 10 ? ticks.filter((_, i) => i % 2 === 0) : ticks;
            })()}
          />
          <Area 
            type="monotone" 
            dataKey={dataKey} 
            stroke={color} 
            strokeWidth={2}
            fillOpacity={1} 
            fill={`url(#gradient-${dataKey})`} 
          />
          <Tooltip 
            contentStyle={{ 
              backgroundColor: '#18181b', 
              border: '1px solid #27272a',
              borderRadius: '8px',
              fontSize: '12px'
            }}
            labelFormatter={(value) => {
              const d = new Date(value as number);
              return d.toLocaleString('en-US', { 
                hour: '2-digit', 
                minute: '2-digit', 
                second: '2-digit',
                hour12: false 
              });
            }}
            formatter={(value) => [formatNumber(value as number), title]}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [submolts, setSubmolts] = useState<SubmoltData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const [statsRes, submoltsRes] = await Promise.all([
          fetch('/api/stats'),
          fetch('/api/submolts')
        ]);
        
        if (!statsRes.ok) throw new Error('Failed to fetch stats');
        const statsData = await statsRes.json();
        setStats(statsData);
        
        if (submoltsRes.ok) {
          const submoltsData = await submoltsRes.json();
          setSubmolts(submoltsData.submolts || []);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
    const interval = setInterval(fetchData, 60000); // Refresh every minute
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

        {/* Timeline Charts - One per metric */}
        <div className="space-y-3 mb-8">
          <h2 className="text-lg font-semibold mb-2">Live Timelines</h2>
          {stats?.history && stats.history.length > 0 ? (
            <>
              <MiniChart
                title="Agents"
                data={stats.history}
                dataKey="agents"
                color="#10b981"
                icon="🤖"
                currentValue={stats.current.totalAgents}
              />
              <MiniChart
                title="Posts"
                data={stats.history}
                dataKey="posts"
                color="#3b82f6"
                icon="📝"
                currentValue={stats.current.totalPosts}
              />
              <MiniChart
                title="Comments"
                data={stats.history}
                dataKey="comments"
                color="#f59e0b"
                icon="💬"
                currentValue={stats.current.totalComments}
              />
              <MiniChart
                title="Submolts"
                data={stats.history}
                dataKey="submolts"
                color="#8b5cf6"
                icon="🏘️"
                currentValue={stats.current.totalSubmolts}
              />
            </>
          ) : (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center text-zinc-500">
              No historical data yet. Snapshots are collected every minute.
            </div>
          )}
        </div>

        {/* Top Submolts */}
        {submolts.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold mb-4">🏘️ Top Submolts</h2>
            <div className="space-y-3">
              {submolts.map((submolt) => {
                const chartData = submolt.history.map(h => ({ 
                  ...h, 
                  time: new Date(h.timestamp).getTime() 
                }));
                const metrics = [
                  { key: 'subscribers', label: '👥', value: submolt.current.subscribers, color: '#10b981' },
                  { key: 'posts', label: '📝', value: submolt.current.posts, color: '#3b82f6' },
                  { key: 'upvotes', label: '⬆️', value: submolt.current.upvotes, color: '#f59e0b' },
                  { key: 'comments', label: '💬', value: submolt.current.comments, color: '#8b5cf6' },
                ];
                return (
                  <div key={submolt.name} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-white font-semibold text-sm">{submolt.displayName || submolt.name}</span>
                      <span className="text-zinc-600 text-xs">m/{submolt.name}</span>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {metrics.map((metric) => (
                        <div key={metric.key} className="bg-zinc-800/50 rounded-lg p-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs">{metric.label}</span>
                            <span className="text-xs text-white font-medium">
                              {metric.value >= 1000 ? (metric.value / 1000).toFixed(1) + 'K' : metric.value}
                            </span>
                          </div>
                          {chartData.length > 1 && (
                            <ResponsiveContainer width="100%" height={30}>
                              <AreaChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                                <defs>
                                  <linearGradient id={`grad-${submolt.name}-${metric.key}`} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={metric.color} stopOpacity={0.4}/>
                                    <stop offset="95%" stopColor={metric.color} stopOpacity={0}/>
                                  </linearGradient>
                                </defs>
                                <Area 
                                  type="monotone" 
                                  dataKey={metric.key} 
                                  stroke={metric.color} 
                                  strokeWidth={1.5}
                                  fill={`url(#grad-${submolt.name}-${metric.key})`} 
                                />
                              </AreaChart>
                            </ResponsiveContainer>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

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
