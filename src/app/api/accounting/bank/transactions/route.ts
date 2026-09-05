import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';
import { categoryDef } from '@/lib/finance/pcg';

export const dynamic = 'force-dynamic';

const round = (n: number) => Math.round(n * 100) / 100;

// GET ?period=YYYY-MM — données de l'onglet Banque (rapprochement).
export async function GET(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const period = req.nextUrl.searchParams.get('period') || new Date().toISOString().slice(0, 7);

  const [{ data: accounts }, { data: allTx }, { data: recon }] = await Promise.all([
    supabaseAdmin.from('bank_accounts').select('*'),
    supabaseAdmin.from('bank_transactions').select('*').eq('period', period).order('booking_date', { ascending: false }),
    supabaseAdmin.from('reconciliations').select('*').eq('period', period).maybeSingle(),
  ]);

  const txs = allTx || [];
  const toDo = txs.filter(t => !t.reconciled && !t.ignored);
  const done = txs.filter(t => t.reconciled);

  const gap = round(toDo.reduce((s, t) => s + Number(t.amount), 0));
  const statementBalance = round((accounts || []).reduce((s, a) => s + (Number(a.balance) || 0), 0));
  const bookBalance = round(statementBalance - gap);

  const rows = toDo.map(t => {
    const def = categoryDef(t.category);
    const inn = t.direction === 'in';
    const kind = t.match_kind || (t.confidence >= 90 ? 'match' : 'create');
    return {
      id: t.id,
      label: t.label,
      date: t.booking_date,
      amount: Number(t.amount),
      direction: t.direction,
      kind,
      confidence: t.confidence || 0,
      category: def.key,
      categoryLabel: def.label,
      match: kind === 'split'
        ? 'Versement Stripe groupé'
        : `${inn ? 'Recette' : 'Dépense'} · ${def.label}`,
      why: kind === 'split'
        ? 'Un seul virement Stripe regroupe plusieurs commandes : je les décompose et je rapproche chaque facture.'
        : (t.confidence >= 90
            ? 'Contrepartie reconnue — même montant, même sens.'
            : `À enregistrer : je propose « ${def.label} ». Vérifie avant de valider.`),
    };
  });

  const autoRows = done.slice(0, 12).map(t => {
    const def = categoryDef(t.category);
    return {
      id: t.id,
      date: t.booking_date,
      label: t.label,
      match: t.is_split_parent ? 'Versement Stripe décomposé' : def.label,
      amount: Number(t.amount),
      direction: t.direction,
    };
  });

  const pendingIn = round(toDo.filter(t => t.direction === 'in').reduce((s, t) => s + Number(t.amount), 0));
  const pendingOut = round(toDo.filter(t => t.direction === 'out').reduce((s, t) => s + Number(t.amount), 0));
  const pending = [
    pendingIn ? { label: 'Encaissements à rapprocher', sub: `${toDo.filter(t => t.direction === 'in').length} ligne(s)`, note: 'ils rejoindront la compta une fois validés', amount: pendingIn } : null,
    pendingOut ? { label: 'Dépenses à rapprocher', sub: `${toDo.filter(t => t.direction === 'out').length} ligne(s)`, note: 'à ranger dans une catégorie', amount: pendingOut } : null,
  ].filter(Boolean);

  return NextResponse.json({
    period,
    total: txs.length,
    done: done.length,
    left: toDo.length,
    statementBalance,
    bookBalance,
    gap,
    rows,
    autoRows,
    pending,
    signed: recon?.status === 'signed',
    signedAt: recon?.signed_at || null,
    hasAccounts: (accounts || []).length > 0,
  });
}
