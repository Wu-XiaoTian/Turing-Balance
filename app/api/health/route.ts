import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'Turing Balance API',
    timestamp: new Date().toISOString()
  });
}