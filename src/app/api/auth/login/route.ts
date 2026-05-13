import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// ─── POST /api/auth/login ─────────────────────────────────────────
export async function POST(req: NextRequest) {
  const { email, password } = await req.json();

  if (!email || !password) {
    return NextResponse.json({ error: 'Email et mot de passe requis' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.auth.signInWithPassword({ email, password });

  if (error) {
    return NextResponse.json({ error: 'Identifiants incorrects' }, { status: 401 });
  }

  const response = NextResponse.json({
    user: {
      id:    data.user.id,
      email: data.user.email,
    },
    access_token:  data.session?.access_token,
    refresh_token: data.session?.refresh_token,
    expires_at:    data.session?.expires_at,
  });

  // Cookie httpOnly pour que middleware + API routes puissent vérifier la session
  if (data.session?.access_token) {
    response.cookies.set('sd_admin_token', data.session.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 jours
      path: '/',
    });
  }

  return response;
}

// ─── GET /api/auth/login ──────────────────────────────────────────
// Vérifier le token courant
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }
  const token = authHeader.slice(7);
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return NextResponse.json({ error: 'Token expiré' }, { status: 401 });

  return NextResponse.json({ user: { id: user.id, email: user.email } });
}
