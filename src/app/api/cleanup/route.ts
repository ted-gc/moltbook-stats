import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    if (!process.env.DATABASE_URL) {
      return NextResponse.json({ error: 'DATABASE_URL not configured' }, { status: 500 });
    }

    const sql = neon(process.env.DATABASE_URL);

    // Delete first 4 bad data points (where agents = 0)
    const result = await sql`
      DELETE FROM stats_snapshots 
      WHERE total_agents = 0 OR total_agents IS NULL
      RETURNING id, captured_at
    `;

    return NextResponse.json({
      success: true,
      deleted: result.length,
      deletedRows: result
    });
  } catch (error) {
    console.error('Cleanup error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
