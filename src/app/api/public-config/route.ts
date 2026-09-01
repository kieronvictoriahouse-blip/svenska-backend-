import { NextResponse } from 'next/server';

// Returns only PUBLIC keys — safe to expose to the frontend.
// The Supabase anon key is designed to be embedded in client code.
export async function GET() {
  const suspendu = process.env.SHOPFLOW_SUSPENDED === '1';
  return NextResponse.json(
    {
      supabaseUrl:     process.env.NEXT_PUBLIC_SUPABASE_URL     || null,
      supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || null,
      suspendu,
    },
    {
      headers: {
        /* Suspendu : pas de cache — la vitrine doit voir le drapeau
           tout de suite, et sa disparition tout aussi vite. */
        'Cache-Control':                suspendu ? 'no-store' : 'public, s-maxage=3600',
        'Access-Control-Allow-Origin':  '*',
      },
    }
  );
}
