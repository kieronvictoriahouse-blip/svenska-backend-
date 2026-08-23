import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/* ═══════════════════════════════════════════════════════════════
   LIVRE DES RECETTES — le registre légal de la micro-entreprise

   Une micro-entreprise ne tient pas de comptabilité d'engagement :
   son obligation comptable centrale est le livre chronologique des
   recettes (art. L123-28 c. com. et 50-0 CGI) — date d'encaissement,
   référence de la pièce, client, nature, montant, mode de règlement.
   Il doit être chronologique et non modifiable après coup ; l'export
   le reconstruit depuis les écritures, qui elles-mêmes remontent aux
   commandes et à leurs factures scellées.

   Les remboursements figurent en négatif à leur date : le livre des
   recettes suit les ENCAISSEMENTS, pas le chiffre facturé.

   GET /api/accounting/livre-recettes?year=2026        → CSV
   ═══════════════════════════════════════════════════════════════ */

const eur = (v: number) => v.toFixed(2).replace('.', ',');

export async function GET(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const year = req.nextUrl.searchParams.get('year') || String(new Date().getFullYear());

  const [{ data: entries }, { data: invoices }] = await Promise.all([
    supabaseAdmin.from('accounting_entries').select('*')
      .eq('type', 'income')
      .gte('date', `${year}-01-01`).lte('date', `${year}-12-31`)
      .order('date', { ascending: true }),
    supabaseAdmin.from('invoices').select('number, order_id'),
  ]);

  /* La pièce justificative d'une recette est la FACTURE, pas la
     commande : on relie le numéro de commande à son numéro de facture. */
  const { data: orders } = await supabaseAdmin
    .from('orders').select('id, order_number');
  const orderIdParNumero = Object.fromEntries((orders || []).map(o => [o.order_number, o.id]));
  const factureParOrder: Record<string, string> = {};
  for (const inv of invoices || []) {
    if (inv.order_id && !factureParOrder[inv.order_id]) factureParOrder[inv.order_id] = inv.number;
  }

  const SEP = ';';
  const lignes: string[] = [
    ['Date', 'Référence pièce', 'Client', 'Nature', 'Montant (EUR)', 'Mode d’encaissement'].join(SEP),
  ];

  let total = 0;
  for (const e of entries || []) {
    const montant = Number(e.amount) || 0;
    total += montant;
    const oid = e.reference_number ? orderIdParNumero[e.reference_number] : null;
    const piece = (oid && factureParOrder[oid]) || e.reference_number || e.id.slice(0, 8);
    /* Le client est dans la description (« Commande SD-0040 — Untel ») ;
       on extrait ce qui suit le tiret long, sinon la description brute. */
    const desc = String(e.description || '');
    const client = desc.includes('—') ? desc.split('—').pop()!.trim() : '';
    const nature = montant < 0
      ? 'Remboursement — vente de marchandises'
      : 'Vente de marchandises (BIC ventes)';
    /* Tous les encaissements de la boutique passent par Stripe. Une
       recette saisie à la main garde sa catégorie comme mode. */
    const mode = e.category === 'vente_en_ligne' || e.reference_type === 'order' || e.reference_type === 'refund'
      ? 'CB en ligne (Stripe)'
      : (e.category || 'Autre');

    lignes.push([
      e.date,
      piece,
      client.replace(new RegExp(SEP, 'g'), ' '),
      nature,
      eur(montant),
      mode,
    ].join(SEP));
  }

  lignes.push('');
  lignes.push(['', '', '', `TOTAL ${year}`, eur(total), ''].join(SEP));

  /* BOM UTF-8 : sans lui, Excel affiche les accents en vrac. */
  const csv = '﻿' + lignes.join('\r\n');

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="livre-recettes-${year}.csv"`,
    },
  });
}
