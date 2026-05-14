import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const { data } = await supabaseAdmin
    .from('company_settings')
    .select('key, value')
    .in('key', ['mr_col_rel', 'mr_mode_col']);

  const get = (k: string) => (data as any[])?.find(s => s.key === k)?.value || '';

  return NextResponse.json({ mr_col_rel: get('mr_col_rel'), mr_mode_col: get('mr_mode_col') });
}
