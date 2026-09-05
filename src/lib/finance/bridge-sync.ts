// ─────────────────────────────────────────────────────────────────────
//  Synchronisation Bridge → bank_accounts / bank_transactions
//  Utilisée par le callback de connexion et par le cron quotidien.
// ─────────────────────────────────────────────────────────────────────
import { supabaseAdmin } from '@/lib/supabase';
import { listBridgeAccounts, listBridgeTransactions, bridgeLabel } from './bridge';
import { ingestTransactions, type RawLine } from './ingest';

export async function syncBridge(): Promise<{ inserted: number; skipped: number; accounts: number; error?: string }> {
  const { data: conn } = await supabaseAdmin
    .from('bank_connections').select('*').eq('provider', 'bridge').maybeSingle();
  const userUuid = conn?.meta?.user_uuid as string | undefined;
  if (!userUuid) return { inserted: 0, skipped: 0, accounts: 0, error: 'Connexion Bridge absente' };

  const accounts = await listBridgeAccounts(userUuid);
  const idMap: Record<string, string> = {}; // bridge account id → notre bank_accounts.id
  let short = 0;
  for (const a of accounts) {
    const { data: up } = await supabaseAdmin.from('bank_accounts').upsert({
      connection_id: conn!.id,
      provider: 'bridge',
      external_id: String(a.id),
      name: a.name || 'Compte bancaire',
      short_code: (a.name || 'CP').replace(/[^A-Za-zÀ-ÿ]/g, '').slice(0, 2).toUpperCase() || `C${++short}`,
      iban: a.iban ? `${a.iban.slice(0, 4)} •••• ${a.iban.slice(-4)}` : null,
      currency: a.currency_code || 'EUR',
      balance: typeof a.balance === 'number' ? a.balance : null,
      balance_at: a.updated_at ? new Date(a.updated_at).toISOString() : new Date().toISOString(),
      status: 'active',
    }, { onConflict: 'provider,external_id' }).select('id').single();
    if (up) idMap[String(a.id)] = up.id;
  }

  const since = new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10);
  const txs = await listBridgeTransactions(userUuid, since);

  // Groupe par compte, puis ingère.
  const byAccount: Record<string, RawLine[]> = {};
  for (const t of txs) {
    const ourId = idMap[String(t.account_id)];
    if (!ourId) continue;
    (byAccount[ourId] ||= []).push({
      external_id: `bridge:${t.id}`,
      booking_date: (t.date || '').slice(0, 10),
      amount: Math.round(Number(t.amount) * 100) / 100,
      currency: t.currency_code || 'EUR',
      label: bridgeLabel(t),
      raw: t,
    });
  }

  let inserted = 0, skipped = 0;
  for (const [accId, lines] of Object.entries(byAccount)) {
    const r = await ingestTransactions(accId, 'bridge', lines.filter(l => l.booking_date && isFinite(l.amount)));
    inserted += r.inserted; skipped += r.skipped;
  }

  await supabaseAdmin.from('bank_connections').update({ status: 'active', last_sync_at: new Date().toISOString() }).eq('id', conn!.id);
  return { inserted, skipped, accounts: accounts.length };
}
