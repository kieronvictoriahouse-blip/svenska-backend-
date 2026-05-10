import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// PCG accounts mapping (Plan Comptable Général)
const ACCOUNT_MAP: Record<string, { num: string; lib: string }> = {
  income_vente_en_ligne: { num: '706000', lib: 'Ventes de marchandises en ligne' },
  income_vente_directe:  { num: '706100', lib: 'Ventes de marchandises directes' },
  income_facture:        { num: '706200', lib: 'Factures clients' },
  income_autre:          { num: '706900', lib: 'Autres produits' },
  expense_achat_marchandise: { num: '607000', lib: 'Achats de marchandises' },
  expense_frais_port:        { num: '624100', lib: 'Transports sur achats — port' },
  expense_frais_logistique:  { num: '624000', lib: 'Transports sur achats — logistique' },
  expense_cotisations:       { num: '645000', lib: 'Charges sociales' },
  expense_autre:             { num: '628000', lib: 'Autres charges externes' },
};

const BANK = { num: '512000', lib: 'Banque' };

const JOURNAL_CODES: Record<string, { code: string; lib: string }> = {
  income:  { code: 'VT', lib: 'Journal des ventes' },
  expense: { code: 'AC', lib: 'Journal des achats' },
};

function fecDate(d: string) {
  // FEC format: YYYYMMDD
  return d.replace(/-/g, '');
}

function fecAmount(n: number) {
  // FEC format: decimal with comma
  return Math.abs(n).toFixed(2).replace('.', ',');
}

function escapeFec(s: string) {
  return (s || '').replace(/\|/g, ' ').replace(/\t/g, ' ').trim();
}

export async function GET(req: NextRequest) {
  const year = req.nextUrl.searchParams.get('year') || new Date().getFullYear().toString();
  const companyName = req.nextUrl.searchParams.get('company') || 'ENTREPRISE';
  const siren = req.nextUrl.searchParams.get('siren') || '000000000';

  const { data, error } = await supabaseAdmin
    .from('accounting_entries')
    .select('*')
    .gte('date', `${year}-01-01`)
    .lte('date', `${year}-12-31`)
    .order('date', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const entries = data || [];

  // FEC header (tab-separated as per DGFiP spec)
  const HEADER = [
    'JournalCode', 'JournalLib', 'EcritureNum', 'EcritureDate',
    'CompteNum', 'CompteLib', 'CompAuxNum', 'CompAuxLib',
    'PieceRef', 'PieceDate', 'EcritureLib',
    'Debit', 'Credit',
    'EcritureLet', 'DateLet', 'ValidDate',
    'Montantdevise', 'Idevise',
  ].join('\t');

  const lines: string[] = [HEADER];
  let ecritureNum = 1;

  for (const entry of entries) {
    const accountKey = `${entry.type}_${entry.category || 'autre'}`;
    const account = ACCOUNT_MAP[accountKey] || ACCOUNT_MAP[`${entry.type}_autre`] || ACCOUNT_MAP['expense_autre'];
    const journal = JOURNAL_CODES[entry.type] || JOURNAL_CODES['expense'];
    const date = fecDate(entry.date);
    const num = String(ecritureNum++).padStart(6, '0');
    const amount = parseFloat(entry.amount);
    const ref = escapeFec(entry.reference_number || entry.id.slice(0, 8));
    const lib = escapeFec(entry.description);

    if (entry.type === 'income') {
      // Debit 512 (Banque) / Credit 706 (Ventes)
      lines.push([
        journal.code, journal.lib, `${year}${num}`, date,
        BANK.num, BANK.lib, '', '',
        ref, date, lib,
        fecAmount(amount), '0,00',
        '', '', date, '', '',
      ].join('\t'));

      lines.push([
        journal.code, journal.lib, `${year}${num}`, date,
        account.num, account.lib, '', '',
        ref, date, lib,
        '0,00', fecAmount(amount),
        '', '', date, '', '',
      ].join('\t'));
    } else {
      // Debit 607/624/628 (Charge) / Credit 512 (Banque)
      lines.push([
        journal.code, journal.lib, `${year}${num}`, date,
        account.num, account.lib, '', '',
        ref, date, lib,
        fecAmount(amount), '0,00',
        '', '', date, '', '',
      ].join('\t'));

      lines.push([
        journal.code, journal.lib, `${year}${num}`, date,
        BANK.num, BANK.lib, '', '',
        ref, date, lib,
        '0,00', fecAmount(amount),
        '', '', date, '', '',
      ].join('\t'));
    }
  }

  const fecContent = lines.join('\r\n');
  const filename = `FEC_${siren}_${year}1231.txt`;

  return new NextResponse(fecContent, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
