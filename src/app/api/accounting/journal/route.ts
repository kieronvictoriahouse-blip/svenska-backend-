import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';
import { categoryDef, journalSides, pcgShort } from '@/lib/finance/pcg';

export const dynamic = 'force-dynamic';

// GET ?year=&period=&limit= — journal des écritures (onglet Livres & export).
export async function GET(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const year = req.nextUrl.searchParams.get('year') || String(new Date().getFullYear());
  const period = req.nextUrl.searchParams.get('period');
  const limit = Math.min(500, Number(req.nextUrl.searchParams.get('limit')) || 100);

  let q = supabaseAdmin.from('accounting_entries')
    .select('date, type, category, description, amount, reference_number, account_code, journal, piece')
    .order('date', { ascending: false }).limit(limit);
  if (period) q = q.gte('date', `${period}-01`).lte('date', `${period}-31`);
  else q = q.gte('date', `${year}-01-01`).lte('date', `${year}-12-31`);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data || []).map(e => {
    const def = categoryDef(e.category);
    const sides = journalSides(def);
    const jrn = e.journal || def.journal;
    return {
      date: new Date(e.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
      jrn,
      piece: e.piece || e.reference_number || '—',
      label: e.description || def.label,
      deb: pcgShort(e.account_code ? (def.sens === 'in' ? '512000' : e.account_code) : sides.debit),
      cred: pcgShort(e.account_code ? (def.sens === 'in' ? e.account_code : '512000') : sides.credit),
      amount: Number(e.amount),
    };
  });

  return NextResponse.json({ rows });
}
