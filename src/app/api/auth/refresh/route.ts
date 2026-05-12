import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const { refresh_token } = await req.json();
  if (!refresh_token) return NextResponse.json({ error: 'refresh_token requis' }, { status: 400 });

  const { data, error } = await supabaseAdmin.auth.refreshSession({ refresh_token });
  if (error || !data.session) return NextResponse.json({ error: 'Session expirée' }, { status: 401 });

  return NextResponse.json({
    access_token:  data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at:    data.session.expires_at,
  });
}
