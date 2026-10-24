import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/* Déconnexion. Le cookie httpOnly `sd_admin_token` échappe au navigateur :
   localStorage.clear() ne le touche pas, et tant qu'il vivait, les routes
   API l'acceptaient encore (repli de requireAuth) — sur un ordinateur
   partagé, « Se déconnecter » ne déconnectait donc pas vraiment.
   On l'efface ici et on révoque la session Supabase, ce qui rend aussi le
   jeton de rafraîchissement inutilisable. */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : req.cookies.get('sd_admin_token')?.value;

  if (token) {
    try { await supabaseAdmin.auth.admin.signOut(token, 'local'); }
    catch { /* jeton déjà expiré : plus rien à révoquer */ }
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set('sd_admin_token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });
  return response;
}
