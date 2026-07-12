import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type');
  const year = searchParams.get('year') || new Date().getFullYear().toString();

  let query = supabaseAdmin
    .from('accounting_entries')
    .select('*')
    .gte('date', `${year}-01-01`)
    .lte('date', `${year}-12-31`)
    .order('date', { ascending: false });

  if (type) query = query.eq('type', type);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entries: data || [] });
}

export async function POST(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const body = await req.json();
  const { date, type, category, description, amount } = body;

  if (!date || !type || !description || amount == null) {
    return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.from('accounting_entries').insert({
    date,
    type,
    category: category || 'autre',
    description,
    amount: parseFloat(amount),
    reference_type: body.reference_type || 'manual',
    reference_id: body.reference_id || null,
    reference_number: body.reference_number || null,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entry: data });
}

export async function DELETE(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID requis' }, { status: 400 });

  // Conservation légale (Art. L.123-22 Ccom) : seules les écritures saisies
  // manuellement sont supprimables. Les écritures issues d'une synchro
  // (commande, réception, coût logistique, remboursement) sont figées —
  // pour les annuler, passer par une écriture de contre-passation.
  const { data: entry } = await supabaseAdmin
    .from('accounting_entries').select('reference_type').eq('id', id).maybeSingle();
  if (!entry) return NextResponse.json({ error: 'Écriture introuvable' }, { status: 404 });
  if (entry.reference_type && entry.reference_type !== 'manual') {
    return NextResponse.json(
      { error: 'Écriture automatique non supprimable (conservation légale). Utilisez une contre-passation.' },
      { status: 403 },
    );
  }

  const { error } = await supabaseAdmin.from('accounting_entries').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
