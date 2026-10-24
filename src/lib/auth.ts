import { NextRequest } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { supabaseAdmin } from './supabase';

/* Un compte Supabase n'est pas forcément un compte admin : le projet
   contient aussi des comptes clients (connexion Google de mai 2026).

   L'admin est marqué par app_metadata.role = 'admin'. app_metadata ne
   s'écrit qu'avec la clé de service (un utilisateur ne modifie que son
   user_metadata) : scripts/installer.js le pose à la création,
   scripts/marquer-admin.js sur un compte existant. */
export function estAdmin(user: User | null | undefined): boolean {
  return (user?.app_metadata as any)?.role === 'admin';
}

/* Le cookie part tout seul avec chaque requête vers le domaine — y compris
   celles qu'un AUTRE site ou un email déclenche : lien cliqué depuis une
   messagerie (navigation de premier niveau, que SameSite=Lax laisse
   passer), image d'un message piégé. Le jeton Bearer, lui, n'est posé que
   par notre propre code (adminFetch). Le cookie ne vaut donc preuve que
   pour une requête née du back-office : le navigateur l'atteste par
   Sec-Fetch-Site (« same-origin »). En-tête absent = client hors
   navigateur ou navigateur ancien, accepté pour ne rien casser ; « none »
   (adresse tapée, lien ouvert depuis une appli de mail) et « cross-site »
   sont refusés. */
function cookieRecevable(req: NextRequest): boolean {
  const site = req.headers.get('sec-fetch-site');
  return !site || site === 'same-origin';
}

export async function requireAuth(req: NextRequest) {
  // 1. Bearer token (localStorage via adminFetch)
  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    // 2. Cookie httpOnly (repli) — seulement pour une requête du back-office lui-même
    : (cookieRecevable(req) ? req.cookies.get('sd_admin_token')?.value : undefined);

  if (!token) return null;
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  return estAdmin(user) ? user : null;
}
