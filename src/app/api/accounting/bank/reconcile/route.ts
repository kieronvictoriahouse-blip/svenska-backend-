import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';
import { categoryDef, typeFromSens, type Sens } from '@/lib/finance/pcg';
import { learnFromCorrection } from '@/lib/finance/categorize';
import { findPayout, explodePayout, stripeConfigured } from '@/lib/finance/stripe-payout';
import { groupeRapprochement, plusProche } from '@/lib/finance/rapprochement';

export const dynamic = 'force-dynamic';

const BANK = '512000';
const round2 = (n: number) => Math.round(n * 100) / 100;
const decaler = (iso: string, jours: number) =>
  new Date(new Date(iso + 'T12:00:00Z').getTime() + jours * 86400_000).toISOString().slice(0, 10);

async function loadTx(id: string) {
  const { data } = await supabaseAdmin.from('bank_transactions').select('*').eq('id', id).maybeSingle();
  return data;
}

async function assertPeriodOpen(period: string): Promise<boolean> {
  const { data } = await supabaseAdmin.from('accounting_periods').select('status').eq('period', period).maybeSingle();
  return !data || data.status !== 'closed';
}

/* ── Écriture DÉJÀ en compta pour ce mouvement ─────────────────────────
   Les ventes arrivent en compta par le webhook Stripe (une écriture par
   commande), les achats par la synchro des réceptions. Rapprocher la
   ligne bancaire en CRÉANT une seconde écriture comptait deux fois la
   même vente ou le même achat — et l'URSSAF se calculait sur le double.
   On cherche donc d'abord l'écriture existante : même sens, même montant,
   date proche, pas encore rapprochée, même famille de catégorie. */
async function ecritureExistante(tx: any, categoryKey: string): Promise<any | null> {
  const montant = Math.abs(Number(tx.amount));
  const type = typeFromSens(tx.direction as Sens);
  const { data } = await supabaseAdmin.from('accounting_entries')
    .select('id, date, amount, category, reference_type')
    .eq('type', type).is('bank_transaction_id', null)
    .gte('amount', montant - 0.005).lte('amount', montant + 0.005)
    .gte('date', decaler(tx.booking_date, -15)).lte('date', decaler(tx.booking_date, 5))
    .in('reference_type', ['order', 'reception', 'landed_cost', 'manual'])
    .limit(20);
  const groupe = groupeRapprochement(categoryKey);
  return plusProche((data || []).filter(e => groupeRapprochement(e.category) === groupe), tx.booking_date);
}

async function lierEcriture(tx: any, entry: any) {
  const { error } = await supabaseAdmin.from('accounting_entries')
    .update({ reconciled: true, bank_transaction_id: tx.id }).eq('id', entry.id).is('bank_transaction_id', null);
  if (error) throw new Error(error.message);
  const def = categoryDef(entry.category);
  await supabaseAdmin.from('bank_transactions').update({
    matched_entry_id: entry.id, reconciled: true, reconciled_at: new Date().toISOString(),
    category: def.key, account_code: def.account,
  }).eq('id', tx.id);
  return entry.id;
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
  if (!['match', 'create', 'categorize', 'split', 'ignore'].includes(action)) {
    return NextResponse.json({ error: 'action inconnue' }, { status: 400 });
  }

  const tx = await loadTx(tx_id);
  if (!tx) return NextResponse.json({ error: 'Ligne introuvable' }, { status: 404 });
  if (tx.reconciled) return NextResponse.json({ error: 'Déjà rapprochée' }, { status: 409 });
  if (tx.period && !await assertPeriodOpen(tx.period)) {
    return NextResponse.json({ error: 'Mois clôturé — passe une écriture de rectification.' }, { status: 423 });
  }

  if (action === 'ignore') {
    await supabaseAdmin.from('bank_transactions').update({ ignored: true }).eq('id', tx_id).eq('reconciled', false);
    return NextResponse.json({ ok: true, ignored: true });
  }

  const category = body.category || tx.category || (tx.direction === 'in' ? 'vente' : 'autre');

  /* Versement Stripe rangé comme une vente : ses ventes sont déjà en
     compta, une écriture par commande. L'enregistrer comme recette
     doublait le chiffre d'affaires du versement. */
  if (action !== 'split' && tx.direction === 'in' && /STRIPE/i.test(`${tx.label || ''} ${tx.counterparty || ''}`)
      && groupeRapprochement(category) === 'ventes') {
    return NextResponse.json({
      error: 'Versement Stripe : ses ventes sont déjà comptées (une écriture par commande). Utilise « Décomposer », ou « Plus tard » si Stripe n’est pas relié.',
    }, { status: 409 });
  }

  /* Prise atomique de la ligne : deux clics (ou deux onglets) passaient
     tous les deux le test `reconciled` ci-dessus et créaient deux
     écritures. Seul le premier UPDATE … WHERE reconciled = false gagne. */
  const { data: pris } = await supabaseAdmin.from('bank_transactions')
    .update({ reconciled: true, reconciled_at: new Date().toISOString() })
    .eq('id', tx_id).eq('reconciled', false).select('id');
  if (!pris?.length) return NextResponse.json({ error: 'Déjà rapprochée' }, { status: 409 });
  const liberer = () => supabaseAdmin.from('bank_transactions')
    .update({ reconciled: false, reconciled_at: null }).eq('id', tx_id);

  try {
    if (action === 'split') {
      if (!stripeConfigured()) { await liberer(); return NextResponse.json({ error: 'Stripe non configuré' }, { status: 400 }); }
      const payout = await findPayout(Number(tx.amount), tx.booking_date);
      if (!payout) { await liberer(); return NextResponse.json({ error: 'Versement Stripe introuvable pour cette ligne.' }, { status: 404 }); }
      // Un même versement ne se décompose qu'une fois (montant identique deux semaines de suite).
      const { data: deja } = await supabaseAdmin.from('bank_transactions').select('id')
        .eq('is_split_parent', true).contains('raw', { stripe_payout: { payoutId: payout.id } }).limit(1);
      if (deja?.length) { await liberer(); return NextResponse.json({ error: 'Ce versement Stripe est déjà décomposé sur une autre ligne.' }, { status: 409 }); }

      const bd = await explodePayout(payout.id);
      const vente = categoryDef('vente');
      const stripe = categoryDef('stripe');
      let count = 0, lies = 0;
      const ordresLies: string[] = [];
      for (const ch of bd.charges) {
        /* La vente est déjà en compta (webhook) : on la rattache au
           versement au lieu de l'inscrire une seconde fois. */
        const { data: cands } = await supabaseAdmin.from('accounting_entries')
          .select('id, date, amount, category, reference_id')
          .eq('type', 'income').eq('reference_type', 'order').is('bank_transaction_id', null)
          .gte('amount', ch.amount - 0.005).lte('amount', ch.amount + 0.005)
          .gte('date', decaler(ch.date, -3)).lte('date', decaler(ch.date, 3)).limit(20);
        const existante = plusProche(cands || [], ch.date);
        if (existante) {
          const { error } = await supabaseAdmin.from('accounting_entries')
            .update({ reconciled: true, bank_transaction_id: tx.id }).eq('id', existante.id);
          if (error) throw new Error(error.message);
          if (existante.reference_id) ordresLies.push(existante.reference_id);
          lies++; count++;
          continue;
        }
        const { error } = await supabaseAdmin.from('accounting_entries').insert({
          date: ch.date, type: 'income', category: vente.key,
          description: `Stripe · ${ch.orderNumber || ch.description}${ch.customer ? ' · ' + ch.customer : ''}`,
          amount: ch.amount, reference_type: 'bank', reference_number: ch.chargeId,
          account_code: vente.account, counterparty_account: BANK, journal: 'VE',
          source: 'stripe', reconciled: true, sorted_at: new Date().toISOString(),
          bank_transaction_id: tx.id, period: tx.period,
        });
        if (error) throw new Error(error.message);   // plus de « décomposé » sur une écriture perdue
        count++;
      }

      /* Frais : les commandes rattachées portent déjà leur frais Stripe
         ESTIMÉ (1,5 % + 0,25 €, webhook). On les rattache aussi, et on
         n'inscrit que la différence avec les frais réels du versement. */
      let estimes = 0;
      if (ordresLies.length) {
        const { data: fraisEst } = await supabaseAdmin.from('accounting_entries')
          .select('id, amount').eq('type', 'expense').eq('reference_type', 'order').eq('category', 'frais_stripe')
          .in('reference_id', ordresLies).is('bank_transaction_id', null);
        for (const f of fraisEst || []) {
          estimes += Number(f.amount) || 0;
          await supabaseAdmin.from('accounting_entries').update({ reconciled: true, bank_transaction_id: tx.id }).eq('id', f.id);
        }
      }
      const fraisAInscrire = round2(bd.fee - estimes);
      if (Math.abs(fraisAInscrire) >= 0.01) {
        const { error } = await supabaseAdmin.from('accounting_entries').insert({
          date: bd.arrivalDate, type: 'expense', category: stripe.key,
          description: estimes ? `Frais Stripe · versement ${bd.arrivalDate} (écart avec les frais estimés)` : `Frais Stripe · versement ${bd.arrivalDate}`,
          amount: fraisAInscrire,
          reference_type: 'bank', reference_number: `${payout.id}-fee`,
          account_code: stripe.account, counterparty_account: BANK, journal: 'BQ',
          source: 'stripe', reconciled: true, sorted_at: new Date().toISOString(),
          bank_transaction_id: tx.id, period: tx.period,
        });
        if (error) throw new Error(error.message);
      }
      await supabaseAdmin.from('bank_transactions').update({
        reconciled: true, reconciled_at: new Date().toISOString(),
        is_split_parent: true, match_kind: 'split',
        raw: { ...(tx.raw || {}), stripe_payout: bd },
      }).eq('id', tx_id);
      return NextResponse.json({ ok: true, split: true, charges: count, linked: lies, fee: bd.fee });
    }

    // match | create | categorize → rattache l'écriture existante, sinon la crée
    const existante = await ecritureExistante(tx, category);
    if (existante) {
      const entryId = await lierEcriture(tx, existante);
      return NextResponse.json({ ok: true, entryId, category: categoryDef(existante.category).key, linked: true });
    }
    const entryId = await createEntry(tx, category, body.is_personal);
    return NextResponse.json({ ok: true, entryId, category });
  } catch (e: any) {
    // Échec en route : on défait ce qui a été posé, la ligne revient dans la pile.
    await defaire(tx_id).catch(() => {});
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/* Défait un rapprochement : les écritures CRÉÉES depuis la banque sont
   supprimées ; celles qui existaient avant (commande, réception…) sont
   seulement détachées. L'ancien code supprimait tout ce qui portait la
   ligne — une vente rattachée y aurait disparu de la compta. */
async function defaire(txId: string) {
  const del = await supabaseAdmin.from('accounting_entries').delete()
    .eq('bank_transaction_id', txId).eq('reference_type', 'bank');
  if (del.error) throw new Error(del.error.message);
  const det = await supabaseAdmin.from('accounting_entries')
    .update({ bank_transaction_id: null, reconciled: false }).eq('bank_transaction_id', txId);
  if (det.error) throw new Error(det.error.message);
  const maj = await supabaseAdmin.from('bank_transactions').update({
    reconciled: false, reconciled_at: null, matched_entry_id: null,
    ignored: false, is_split_parent: false,
  }).eq('id', txId);
  if (maj.error) throw new Error(maj.error.message);
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
  try { await defaire(txId); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
  return NextResponse.json({ ok: true });
}
