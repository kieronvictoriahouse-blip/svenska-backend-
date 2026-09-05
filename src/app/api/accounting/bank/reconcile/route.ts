import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';
import { categoryDef, typeFromSens, type Sens } from '@/lib/finance/pcg';
import { learnFromCorrection } from '@/lib/finance/categorize';
import { findPayout, explodePayout, stripeConfigured } from '@/lib/finance/stripe-payout';

export const dynamic = 'force-dynamic';

const BANK = '512000';

async function loadTx(id: string) {
  const { data } = await supabaseAdmin.from('bank_transactions').select('*').eq('id', id).maybeSingle();
  return data;
}

async function assertPeriodOpen(period: string): Promise<boolean> {
  const { data } = await supabaseAdmin.from('accounting_periods').select('status').eq('period', period).maybeSingle();
  return !data || data.status !== 'closed';
}

// Crée une écriture de trésorerie à partir d'une ligne bancaire + catégorie.
async function createEntry(tx: any, categoryKey: string, personalOverride?: boolean) {
  const def = categoryDef(categoryKey);
  const isPersonal = personalOverride ?? !!def.personal;
  const type = typeFromSens(def.sens as Sens);
  const { data: entry, error } = await supabaseAdmin.from('accounting_entries').insert({
    date: tx.booking_date,
    type,
    category: def.key,
    description: tx.label,
    amount: Math.abs(Number(tx.amount)),
    reference_type: 'bank',
    reference_number: tx.external_id,
    account_code: def.account,
    counterparty_account: BANK,
    journal: def.journal,
    source: 'bank',
    is_personal: isPersonal,
    confidence: tx.confidence || null,
    reconciled: true,
    sorted_at: new Date().toISOString(),
    bank_transaction_id: tx.id,
    period: tx.period,
    receipt_url: tx.receipt_url || null,
  }).select('id').single();
  if (error) throw new Error(error.message);

  await supabaseAdmin.from('bank_transactions').update({
    matched_entry_id: entry.id, reconciled: true, reconciled_at: new Date().toISOString(),
    category: def.key, account_code: def.account, is_personal: isPersonal,
  }).eq('id', tx.id);

  await learnFromCorrection({
    label: tx.label, direction: def.sens as Sens, category: def.key,
    account_code: def.account, is_personal: isPersonal, ruleId: null,
  }).catch(() => {});

  return entry.id;
}

// POST { tx_id, action, category?, is_personal? }
//   action: match | create | categorize | split | ignore
export async function POST(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const { tx_id, action } = body;
  if (!tx_id) return NextResponse.json({ error: 'tx_id requis' }, { status: 400 });

  const tx = await loadTx(tx_id);
  if (!tx) return NextResponse.json({ error: 'Ligne introuvable' }, { status: 404 });
  if (tx.reconciled) return NextResponse.json({ error: 'Déjà rapprochée' }, { status: 409 });
  if (tx.period && !await assertPeriodOpen(tx.period)) {
    return NextResponse.json({ error: 'Mois clôturé — passe une écriture de rectification.' }, { status: 423 });
  }

  try {
    if (action === 'ignore') {
      await supabaseAdmin.from('bank_transactions').update({ ignored: true }).eq('id', tx_id);
      return NextResponse.json({ ok: true, ignored: true });
    }

    if (action === 'split') {
      if (!stripeConfigured()) return NextResponse.json({ error: 'Stripe non configuré' }, { status: 400 });
      const payout = await findPayout(Number(tx.amount), tx.booking_date);
      if (!payout) return NextResponse.json({ error: 'Versement Stripe introuvable pour cette ligne.' }, { status: 404 });
      const bd = await explodePayout(payout.id);
      const vente = categoryDef('vente');
      const stripe = categoryDef('stripe');
      let count = 0;
      for (const ch of bd.charges) {
        const { data: e } = await supabaseAdmin.from('accounting_entries').insert({
          date: ch.date, type: 'income', category: vente.key,
          description: `Stripe · ${ch.orderNumber || ch.description}${ch.customer ? ' · ' + ch.customer : ''}`,
          amount: ch.amount, reference_type: 'bank', reference_number: ch.chargeId,
          account_code: vente.account, counterparty_account: BANK, journal: 'VE',
          source: 'stripe', reconciled: true, sorted_at: new Date().toISOString(),
          bank_transaction_id: tx.id, period: tx.period,
        }).select('id').single();
        count++;
        void e;
      }
      if (bd.fee > 0) {
        await supabaseAdmin.from('accounting_entries').insert({
          date: bd.arrivalDate, type: 'expense', category: stripe.key,
          description: `Frais Stripe · versement ${bd.arrivalDate}`, amount: bd.fee,
          reference_type: 'bank', reference_number: `${payout.id}-fee`,
          account_code: stripe.account, counterparty_account: BANK, journal: 'BQ',
          source: 'stripe', reconciled: true, sorted_at: new Date().toISOString(),
          bank_transaction_id: tx.id, period: tx.period,
        });
      }
      await supabaseAdmin.from('bank_transactions').update({
        reconciled: true, reconciled_at: new Date().toISOString(),
        is_split_parent: true, match_kind: 'split',
        raw: { ...(tx.raw || {}), stripe_payout: bd },
      }).eq('id', tx_id);
      return NextResponse.json({ ok: true, split: true, charges: count, fee: bd.fee });
    }

    // match | create | categorize → crée l'écriture
    const category = body.category || tx.category || (tx.direction === 'in' ? 'vente' : 'autre');
    const entryId = await createEntry(tx, category, body.is_personal);
    return NextResponse.json({ ok: true, entryId, category });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE ?tx_id= — annule le rapprochement (remet la ligne dans la pile).
export async function DELETE(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const txId = req.nextUrl.searchParams.get('tx_id');
  if (!txId) return NextResponse.json({ error: 'tx_id requis' }, { status: 400 });
  const tx = await loadTx(txId);
  if (!tx) return NextResponse.json({ error: 'Introuvable' }, { status: 404 });
  if (tx.period && !await assertPeriodOpen(tx.period)) {
    return NextResponse.json({ error: 'Mois clôturé' }, { status: 423 });
  }
  // Supprime toutes les écritures liées à cette ligne (split inclus).
  await supabaseAdmin.from('accounting_entries').delete().eq('bank_transaction_id', txId);
  await supabaseAdmin.from('bank_transactions').update({
    reconciled: false, reconciled_at: null, matched_entry_id: null,
    ignored: false, is_split_parent: false,
  }).eq('id', txId);
  return NextResponse.json({ ok: true });
}
