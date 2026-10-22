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

export async function requireAuth(req: NextRequest) {
  // 1. Bearer token (localStorage via adminFetch)
  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : req.cookies.get('sd_admin_token')?.value; // 2. Cookie httpOnly (fallback)

  if (!token) return null;
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  return estAdmin(user) ? user : null;
}
