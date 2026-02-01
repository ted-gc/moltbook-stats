import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '100');
  const minWeight = parseInt(searchParams.get('minWeight') || '1');

  try {
    // Get top connected agents as nodes
    const nodes = await sql`
      SELECT 
        a.id,
        a.name,
        a.karma,
        COALESCE(outgoing.weight, 0) + COALESCE(incoming.weight, 0) as connections
      FROM agents a
      LEFT JOIN (
        SELECT from_agent_id, SUM(edge_weight) as weight 
        FROM network_edges GROUP BY from_agent_id
      ) outgoing ON a.id = outgoing.from_agent_id
      LEFT JOIN (
        SELECT to_agent_id, SUM(edge_weight) as weight 
        FROM network_edges GROUP BY to_agent_id
      ) incoming ON a.id = incoming.to_agent_id
      WHERE COALESCE(outgoing.weight, 0) + COALESCE(incoming.weight, 0) > 0
      ORDER BY connections DESC
      LIMIT ${limit}
    `;

    const nodeIds = nodes.map(n => n.id);

    // Get edges between these nodes
    const edges = await sql`
      SELECT 
        from_agent_id as source,
        to_agent_id as target,
        edge_weight as weight
      FROM network_edges
      WHERE from_agent_id = ANY(${nodeIds})
        AND to_agent_id = ANY(${nodeIds})
        AND edge_weight >= ${minWeight}
    `;

    return NextResponse.json({
      nodes: nodes.map(n => ({
        id: n.id,
        name: n.name,
        karma: n.karma,
        connections: Number(n.connections)
      })),
      edges: edges.map(e => ({
        source: e.source,
        target: e.target,
        weight: e.weight
      }))
    });
  } catch (error) {
    console.error('Network error:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}
