import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';
import { categoryDef } from '@/lib/finance/pcg';
import { toutLire } from '@/lib/finance/tout-lire';

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

  if (!/^\d{4}$/.test(year)) return NextResponse.json({ error: 'Année invalide' }, { status: 400 });

  /* Lectures complètes (au-delà de 1000 lignes, Supabase tronquait sans
     le dire : le registre légal s'arrêtait en cours d'année). */
  let entries: any[], invoices: any[], orders: any[];
  try {
    [entries, invoices, orders] = await Promise.all([
      toutLire(() => supabaseAdmin.from('accounting_entries').select('*')
        .eq('type', 'income')
        .gte('date', `${year}-01-01`).lte('date', `${year}-12-31`)
        .order('date', { ascending: true }).order('created_at', { ascending: true }).order('id', { ascending: true })),
      toutLire(() => supabaseAdmin.from('invoices').select('id, number, order_id, status, date').order('id', { ascending: true })),
      toutLire(() => supabaseAdmin.from('orders').select('id, order_number').order('id', { ascending: true })),
    ]);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }

  /* La pièce justificative d'une recette est la FACTURE, pas la
     commande ; celle d'un remboursement est l'AVOIR. L'ancienne table
     prenait la première pièce venue de la commande — parfois l'avoir
     pour la vente. */
  const orderIdParNumero = Object.fromEntries(orders.map(o => [o.order_number, o.id]));
  const factureParOrder: Record<string, string> = {};
  const avoirsParOrder: Record<string, Array<{ number: string; date: string }>> = {};
  for (const inv of invoices) {
    if (!inv.order_id) continue;
    if (inv.status === 'avoir') (avoirsParOrder[inv.order_id] ||= []).push({ number: inv.number, date: inv.date });
    else if (!factureParOrder[inv.order_id]) factureParOrder[inv.order_id] = inv.number;
  }
  const avoirDe = (oid: string, date: string) => {
    const av = (avoirsParOrder[oid] || []).slice().sort((a, b) => a.date.localeCompare(b.date));
    return (av.find(a => a.date === date) || av.filter(a => a.date <= date).pop() || av[0])?.number;
  };

  const SEP = ';';
  const lignes: string[] = [
    ['Date', 'Référence pièce', 'Client', 'Nature', 'Montant (EUR)', 'Mode d’encaissement'].join(SEP),
  ];

  let total = 0;
  for (const e of entries) {
    /* Hors recettes : l'apport de l'exploitant (« Mon apport personnel »,
       is_personal) et le remboursement reçu d'un tiers (758) ne sont pas
       des ventes — ils figuraient au registre comme « Vente de
       marchandises » et gonflaient son total. */
    const cat = categoryDef(e.category).key;
    if (e.is_personal || cat === 'apport' || cat === 'remb') continue;
    const montant = Number(e.amount) || 0;
    total += montant;
    const oid = e.reference_number ? orderIdParNumero[e.reference_number] : null;
    const piece = (oid && (montant < 0 ? avoirDe(oid, e.date) : factureParOrder[oid]))
      || (oid && factureParOrder[oid]) || e.reference_number || e.id.slice(0, 8);
    /* Le client est dans la description (« Commande SD-0040 — Untel ») ;
       on extrait ce qui suit le tiret long, sinon la description brute. */
    const desc = String(e.description || '');
    const client = desc.includes('—') ? desc.split('—').pop()!.trim() : '';
    const nature = montant < 0
      ? 'Remboursement — vente de marchandises'
      : 'Vente de marchandises (BIC ventes)';
    /* Mode d'encaissement : la boutique encaisse par Stripe ; une recette
       rangée depuis le relevé bancaire est arrivée par virement. (L'ancien
       repli écrivait la clé de catégorie — « vente », « pro » — comme mode.) */
    const mode = e.category === 'vente_en_ligne' || e.reference_type === 'order' || e.reference_type === 'refund' || e.source === 'stripe'
      ? 'CB en ligne (Stripe)'
      : e.reference_type === 'bank' ? 'Virement bancaire' : 'Autre';

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
  lignes.push(['', '', '', `TOTAL ${year}`, eur(Math.round(total * 100) / 100), ''].join(SEP));

  /* BOM UTF-8 : sans lui, Excel affiche les accents en vrac. */
  const csv = '﻿' + lignes.join('\r\n');

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="livre-recettes-${year}.csv"`,
    },
  });
}
