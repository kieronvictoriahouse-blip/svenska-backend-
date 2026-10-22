import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { estAdmin } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const { refresh_token } = await req.json();
  if (!refresh_token) return NextResponse.json({ error: 'refresh_token requis' }, { status: 400 });

  const { data, error } = await supabaseAdmin.auth.refreshSession({ refresh_token });
  if (error || !data.session) return NextResponse.json({ error: 'Session expirée' }, { status: 401 });
  // Même règle qu'à la connexion : seul un compte admin repart avec un jeton.
  if (!estAdmin(data.user)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const response = NextResponse.json({
    access_token:  data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at:    data.session.expires_at,
  });

  response.cookies.set('sd_admin_token', data.session.access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  });

  return response;
}
