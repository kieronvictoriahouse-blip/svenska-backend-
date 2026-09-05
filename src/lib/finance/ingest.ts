// ─────────────────────────────────────────────────────────────────────
//  Ingestion de lignes bancaires (agrégateur OU import) → bank_transactions
//  Déduplication par (provider, external_id), catégorisation à l'arrivée.
// ─────────────────────────────────────────────────────────────────────

import { supabaseAdmin } from '@/lib/supabase';
import { loadRules, proposeCategory } from './categorize';
import type { Sens } from './pcg';

export interface RawLine {
  external_id: string;
  booking_date: string;
  value_date?: string;
  amount: number;
  currency?: string;
  label: string;
  counterparty?: string;
  status?: 'booked' | 'pending';
  raw?: any;
}

export async function ingestTransactions(
  accountId: string,
  provider: string,
  lines: RawLine[],
): Promise<{ inserted: number; skipped: number }> {
  if (!lines.length) return { inserted: 0, skipped: 0 };
  const rules = await loadRules(true);

  // Lignes déjà connues pour ce compte (évite d'écraser un rapprochement).
  const ids = lines.map(l => l.external_id);
  const { data: known } = await supabaseAdmin
    .from('bank_transactions')
    .select('external_id')
    .eq('provider', provider)
    .in('external_id', ids);
  const knownSet = new Set((known || []).map(k => k.external_id));

  const rows = lines
    .filter(l => !knownSet.has(l.external_id))
    .map(l => {
      const direction: Sens = l.amount >= 0 ? 'in' : 'out';
      const p = proposeCategory(rules, { label: l.label, direction, amount: l.amount });
      const isStripePayout = direction === 'in' && /STRIPE.*(PAYOUT|VIREMENT)|PAYOUT.*STRIPE/i.test(l.label);
      return {
        account_id: accountId,
        provider,
        external_id: l.external_id,
        booking_date: l.booking_date,
        value_date: l.value_date || l.booking_date,
        amount: l.amount,
        currency: l.currency || 'EUR',
        direction,
        label: l.label,
        counterparty: l.counterparty || null,
        status: l.status || 'booked',
        category: p.category,
        account_code: p.account_code,
        confidence: p.confidence,
        match_kind: isStripePayout ? 'split' : (p.confidence >= 90 ? 'match' : 'create'),
        is_personal: p.is_personal,
        period: l.booking_date.slice(0, 7),
        raw: l.raw || {},
      };
    });

  if (!rows.length) return { inserted: 0, skipped: lines.length };

  const { error } = await supabaseAdmin
    .from('bank_transactions')
    .upsert(rows, { onConflict: 'provider,external_id', ignoreDuplicates: true });
  if (error) throw new Error(error.message);

  return { inserted: rows.length, skipped: lines.length - rows.length };
}
