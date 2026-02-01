import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

export async function GET() {
  try {
    // Read and execute schema
    const schemaPath = path.join(process.cwd(), 'src/lib/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    
    // Split into individual statements and execute
    const statements = schema
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    const results = [];
    for (const statement of statements) {
      try {
        await sql.unsafe(statement);
        results.push({ statement: statement.substring(0, 50) + '...', status: 'ok' });
      } catch (error) {
        // Ignore "already exists" errors
        const message = error instanceof Error ? error.message : 'Unknown error';
        if (message.includes('already exists')) {
          results.push({ statement: statement.substring(0, 50) + '...', status: 'exists' });
        } else {
          results.push({ statement: statement.substring(0, 50) + '...', status: 'error', error: message });
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
