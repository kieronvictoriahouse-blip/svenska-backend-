import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';
import { categoryDef } from '@/lib/finance/pcg';
import { toutLire } from '@/lib/finance/tout-lire';

export const dynamic = 'force-dynamic';

/* Comptes PCG : ceux de src/lib/finance/pcg.ts, la source unique que
   montre déjà le journal à l'écran. L'ancienne table propre au FEC
   envoyait les ventes de marchandises en 706 (prestations de services)
   et les emballages en 6063, quand l'écran affichait 707 et 6026 pour
   les mêmes écritures. Seuls les remboursements gardent leur compte. */
const REFUND = { num: '709000', lib: 'Rabais, remises, ristournes accordés' };

const BANK = { num: '512000', lib: 'Banque' };

// Journaux : ceux du journal à l'écran (VE / AC / BQ / OD).
const JOURNAL_LIBS: Record<string, string> = {
  VE: 'Journal des ventes', AC: 'Journal des achats', BQ: 'Journal de banque', OD: 'Opérations diverses',
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
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const year = req.nextUrl.searchParams.get('year') || new Date().getFullYear().toString();
  if (!/^\d{4}$/.test(year)) return NextResponse.json({ error: 'Année invalide' }, { status: 400 });

  /* Nom légal du fichier : <SIREN>FEC<date de clôture> (art. A47 A-1 LPF).
     Le SIREN vient de la configuration, plus d'un paramètre jamais passé
     (le fichier s'appelait FEC_000000000_…). */
  const { data: cfg } = await supabaseAdmin.from('white_label_config').select('siret').limit(1).maybeSingle();
  const siren = req.nextUrl.searchParams.get('siren') || String(cfg?.siret || '').replace(/\D/g, '').slice(0, 9) || '000000000';

  /* Toutes les écritures de l'exercice (au-delà de 1000, la lecture
     unique s'arrêtait en silence), dans un ordre stable : EcritureNum
     doit rester le même d'un export à l'autre. */
  let entries: any[];
  try {
    entries = await toutLire(() => supabaseAdmin
      .from('accounting_entries')
      .select('*')
      .gte('date', `${year}-01-01`)
      .lte('date', `${year}-12-31`)
      .order('date', { ascending: true })
      .order('created_at', { ascending: true })
      .order('id', { ascending: true }));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }

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
    const isRefund = entry.reference_type === 'refund' && entry.type === 'income';
    const def = categoryDef(entry.category);
    // Priorité au compte PCG stocké sur l'écriture (pile de tri) ; sinon
    // celui de la catégorie (écritures issues du sync commandes).
    const account = entry.account_code
      ? { num: entry.account_code, lib: def.label }
      : (isRefund ? REFUND : { num: def.account, lib: def.label });
    const jrnCode = entry.journal || def.journal;
    const journal = { code: jrnCode, lib: JOURNAL_LIBS[jrnCode] || jrnCode };
    const date = fecDate(entry.date);
    const num = String(ecritureNum++).padStart(6, '0');
    const amount = Math.abs(parseFloat(entry.amount));
    const ref = escapeFec(entry.reference_number || entry.id.slice(0, 8));
    const lib = escapeFec(entry.description);
    const isNegative = parseFloat(entry.amount) < 0;

    if (entry.type === 'income') {
      // Vente normale : Débit 512 / Crédit 706
      // Remboursement (négatif) : Débit 709 / Crédit 512 (contre-passation)
      const [debitNum, debitLib, creditNum, creditLib] = isNegative
        ? [account.num, account.lib, BANK.num, BANK.lib]
        : [BANK.num, BANK.lib, account.num, account.lib];
      lines.push([journal.code, journal.lib, `${year}${num}`, date, debitNum, debitLib, '', '', ref, date, lib, fecAmount(amount), '0,00', '', '', date, '', ''].join('\t'));
      lines.push([journal.code, journal.lib, `${year}${num}`, date, creditNum, creditLib, '', '', ref, date, lib, '0,00', fecAmount(amount), '', '', date, '', ''].join('\t'));
    } else {
      // Dépense normale : Débit 607/624 / Crédit 512
      // Remboursement frais (négatif) : Débit 512 / Crédit 627 (contre-passation)
      const [debitNum, debitLib, creditNum, creditLib] = isNegative
        ? [BANK.num, BANK.lib, account.num, account.lib]
        : [account.num, account.lib, BANK.num, BANK.lib];
      lines.push([journal.code, journal.lib, `${year}${num}`, date, debitNum, debitLib, '', '', ref, date, lib, fecAmount(amount), '0,00', '', '', date, '', ''].join('\t'));
      lines.push([journal.code, journal.lib, `${year}${num}`, date, creditNum, creditLib, '', '', ref, date, lib, '0,00', fecAmount(amount), '', '', date, '', ''].join('\t'));
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
