import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';
import { parseStatement } from '@/lib/finance/import-parse';
import { ingestTransactions } from '@/lib/finance/ingest';

export const dynamic = 'force-dynamic';

// POST { filename, content } — importe un relevé OFX/CSV (contenu texte).
export async function POST(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const { filename, content } = body;
  if (!content || typeof content !== 'string') return NextResponse.json({ error: 'Fichier vide' }, { status: 400 });

  let lines;
  try { lines = parseStatement(filename || 'releve.csv', content); }
  catch (e: any) { return NextResponse.json({ error: `Lecture impossible : ${e.message}` }, { status: 400 }); }
  if (!lines.length) return NextResponse.json({ error: 'Aucune opération reconnue dans le fichier.' }, { status: 400 });

  // Compte d'import (créé à la volée).
  let { data: acc } = await supabaseAdmin
    .from('bank_accounts').select('id').eq('provider', 'import').eq('external_id', 'import-main').maybeSingle();
  if (!acc) {
    const { data: conn } = await supabaseAdmin.from('bank_connections')
      .insert({ provider: 'import', status: 'active', institution_name: 'Import de relevé' })
      .select('id').single();
    const { data: created } = await supabaseAdmin.from('bank_accounts').insert({
      connection_id: conn?.id, provider: 'import', external_id: 'import-main',
      name: 'Compte importé', short_code: 'IM', is_primary: false, status: 'active',
    }).select('id').single();
    acc = created;
  }

  const r = await ingestTransactions(acc!.id, 'import', lines);
  return NextResponse.json({ ...r, total: lines.length });
}
