import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';
import { getAccountTransactions, getAccountBalances, gcLabel } from '@/lib/finance/gocardless';
import { ingestTransactions, type RawLine } from '@/lib/finance/ingest';
import { activeProvider } from '@/lib/finance/provider';
import { syncBridge } from '@/lib/finance/bridge-sync';

export const dynamic = 'force-dynamic';

// POST — tire les nouvelles opérations de l'agrégateur actif (Bridge/GoCardless).
// Autorisé admin OU cron (Bearer CRON_SECRET).
export async function POST(req: NextRequest) {
  /* Secret absent : `Bearer ${undefined}` valait « Bearer undefined », et
     n'importe qui envoyant cet en-tête déclenchait la synchro. */
  const cronSecret = process.env.CRON_SECRET;
  const cronOk = !!cronSecret && req.headers.get('Authorization') === `Bearer ${cronSecret}`;
  if (!cronOk && !await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const provider = activeProvider();
  if (provider === 'bridge') {
    try { const r = await syncBridge(); return NextResponse.json(r); }
    catch (e: any) { return NextResponse.json({ error: e.message }, { status: 502 }); }
  }
  if (provider !== 'gocardless') return NextResponse.json({ error: 'Aucun agrégateur configuré' }, { status: 400 });

  const { data: accounts } = await supabaseAdmin
    .from('bank_accounts').select('*').eq('provider', 'gocardless').eq('status', 'active');

  let inserted = 0, skipped = 0;
  const errors: string[] = [];

  for (const acc of accounts || []) {
    try {
      const since = new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10);
      const [txResp, balResp] = await Promise.all([
        getAccountTransactions(acc.external_id, since),
        getAccountBalances(acc.external_id).catch(() => null),
      ]);
      /* Opérations COMPTABILISÉES seulement. Une opération « pending »
         n'a souvent pas de transactionId, et en reçoit un autre une fois
         comptabilisée : elle entrait deux fois (clé différente), jamais
         mise à jour, et se rapprochait deux fois. */
      const booked = txResp.transactions?.booked || [];
      const lines: RawLine[] = booked.map(t => ({
        external_id: `gc:${t.transactionId || t.internalTransactionId || `${t.bookingDate}_${t.transactionAmount.amount}`}`,
        booking_date: (t.bookingDate || t.valueDate || '').slice(0, 10),
        value_date: (t.valueDate || t.bookingDate || '').slice(0, 10),
        amount: Math.round(parseFloat(t.transactionAmount.amount) * 100) / 100,
        currency: t.transactionAmount.currency || 'EUR',
        label: gcLabel(t),
        counterparty: t.creditorName || t.debtorName,
        status: 'booked' as const,
        raw: t,
      })).filter(l => l.booking_date && isFinite(l.amount));

      const r = await ingestTransactions(acc.id, 'gocardless', lines);
      inserted += r.inserted; skipped += r.skipped;

      if (balResp) {
        const bal = (balResp.balances || [])[0];
        if (bal) await supabaseAdmin.from('bank_accounts').update({
          balance: parseFloat(bal.balanceAmount?.amount || '0'),
          balance_at: new Date().toISOString(),
        }).eq('id', acc.id);
      }
    } catch (e: any) {
      errors.push(`${acc.name}: ${e.message}`);
      await supabaseAdmin.from('bank_accounts').update({ status: 'error' }).eq('id', acc.id);
    }
  }

  await supabaseAdmin.from('bank_connections').update({ last_sync_at: new Date().toISOString() }).eq('provider', 'gocardless').eq('status', 'active');
  return NextResponse.json({ inserted, skipped, errors });
}
