import { NextResponse } from 'next/server';

// Returns only PUBLIC keys — safe to expose to the frontend.
// The Supabase anon key is designed to be embedded in client code.
export async function GET() {
  return NextResponse.json(
    {
      supabaseUrl:     process.env.NEXT_PUBLIC_SUPABASE_URL     || null,
      supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || null,
    },
    {
      headers: {
        'Cache-Control':                'public, s-maxage=3600',
        'Access-Control-Allow-Origin':  '*',
      },
    }
  );
}
