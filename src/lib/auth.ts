import { NextRequest } from 'next/server';
import { supabaseAdmin } from './supabase';

export async function requireAuth(req: NextRequest) {
  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  return user ?? null;
}
