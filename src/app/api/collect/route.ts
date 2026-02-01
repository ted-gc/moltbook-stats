import { NextResponse } from 'next/server';
import runFullCollection from '@/lib/collector';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 min timeout for Vercel

export async function GET() {
  try {
    const result = await runFullCollection();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('Collection error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}

// Also allow POST for cron jobs
export async function POST() {
  return GET();
}
