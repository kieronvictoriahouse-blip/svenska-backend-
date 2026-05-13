import { NextRequest } from 'next/server';
import { supabaseAdmin } from './supabase';

export async function requireAuth(req: NextRequest) {
  // 1. Bearer token (localStorage via adminFetch)
  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : req.cookies.get('sd_admin_token')?.value; // 2. Cookie httpOnly (fallback)

  if (!token) return null;
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  return user ?? null;
}
