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

  return NextResponse.json({
    user: {
      id:    data.user.id,
      email: data.user.email,
    },
    access_token:  data.session?.access_token,
    refresh_token: data.session?.refresh_token,
    expires_at:    data.session?.expires_at,
  });
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
