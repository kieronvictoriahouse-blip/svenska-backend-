import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import {
  getRequisition, getAccountMeta, getAccountDetails, getAccountBalances, maskIban,
} from '@/lib/finance/gocardless';
import { syncBridge } from '@/lib/finance/bridge-sync';

export const dynamic = 'force-dynamic';

// GET — retour de la banque après consentement.
//   Bridge     : ?provider=bridge → on synchronise comptes + opérations.
//   GoCardless : ?ref=<reference> → on finalise la requisition.
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const dest = (q: string) => NextResponse.redirect(`${url.origin}/admin/comptabilite?tab=banque&${q}`);

  if (url.searchParams.get('provider') === 'bridge') {
    try { const r = await syncBridge(); return dest(r.error ? `bank_error=${encodeURIComponent(r.error)}` : 'connected=1'); }
    catch (e: any) { return dest(`bank_error=${encodeURIComponent((e.message || 'bridge').slice(0, 120))}`); }
  }

  const reference = url.searchParams.get('ref') || url.searchParams.get('reference');
  const errored = url.searchParams.get('error');
  if (errored) return dest(`bank_error=${encodeURIComponent(errored)}`);
  if (!reference) return dest('bank_error=reference_manquante');

  const { data: conn } = await supabaseAdmin
    .from('bank_connections').select('*').eq('reference', reference).maybeSingle();
  if (!conn) return dest('bank_error=connexion_introuvable');

  try {
    const requisition = await getRequisition(conn.requisition_id);
    const accountIds: string[] = requisition.accounts || [];

    let shortIdx = 0;
    for (const accId of accountIds) {
      const [meta, details, balances] = await Promise.all([
        getAccountMeta(accId).catch(() => ({})),
        getAccountDetails(accId).catch(() => ({ account: {} })),
        getAccountBalances(accId).catch(() => ({ balances: [] })),
      ]);
      const acc = (details as any).account || {};
      const iban = acc.iban || (meta as any).iban || '';
      const bal = ((balances as any).balances || [])[0];
      const name = acc.name || acc.product || conn.institution_name || 'Compte bancaire';
      await supabaseAdmin.from('bank_accounts').upsert({
        connection_id: conn.id,
        provider: 'gocardless',
        external_id: accId,
        name,
        short_code: (conn.institution_name || name).slice(0, 2).toUpperCase() || `C${++shortIdx}`,
        iban: maskIban(iban),
        currency: acc.currency || 'EUR',
        holder_name: acc.ownerName || (details as any).account?.ownerName || null,
        balance: bal ? parseFloat(bal.balanceAmount?.amount || '0') : null,
        balance_at: bal?.referenceDate ? new Date(bal.referenceDate).toISOString() : new Date().toISOString(),
        is_primary: accountIds.indexOf(accId) === 0,
        status: 'active',
      }, { onConflict: 'provider,external_id' });
    }

    await supabaseAdmin.from('bank_connections').update({
      status: 'active',
      access_valid_until: new Date(Date.now() + 90 * 86400_000).toISOString(),
      last_sync_at: new Date().toISOString(),
    }).eq('id', conn.id);

    return dest('connected=1');
  } catch (e: any) {
    await supabaseAdmin.from('bank_connections').update({ status: 'error', error_message: e.message }).eq('id', conn.id);
    return dest(`bank_error=${encodeURIComponent(e.message.slice(0, 120))}`);
  }
}
