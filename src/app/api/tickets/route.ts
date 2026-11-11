import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';
import { matchLine, normalize } from '@/lib/ticket-match';
import { coutsDuTicket, partPortDuTicket, versEuros, taxeIncluse, round2 } from '@/lib/cout-achat';

/* ═══════════════════════════════════════════════════════════════
   TICKETS DE CAISSE

   GET    ?labels=a|b|c&store=<enseigne> → rapproche des libellés au catalogue
   POST   { action: 'finalize' } → crée commande d'achat + réception,
                                   met à jour stock et prix d'achat,
                                   apprend les alias, archive le ticket

   Coût d'un article (lib/cout-achat) : prix payé moms COMPRISE × taux,
   plus la part du port du voyage au prorata du prix. La moms n'est pas
   récupérable (franchise 293 B) : elle est notée pour mémoire, jamais
   retirée du coût.

   POST accepte `shipping` : { amount_eur, trip_goods? }
     amount_eur  port en euros ;
     trip_goods  total des achats du voyage dans la devise du ticket,
                 quand ce port couvre plusieurs tickets. Absent, le port
                 ne concerne que ce ticket.

   Magasin : `supplier_id` (un contact fournisseur : GEKAS, WILLYS…)
   rattache la commande et la réception à son magasin ; `store`, texte
   libre, garde la succursale (« Willys Värnamo Gröndal »). Les alias de
   libellés sont rangés par enseigne — le nom du fournisseur quand il est
   choisi, sinon le texte libre : un libellé de caisse dépend de
   l'enseigne, pas de la succursale.
   ═══════════════════════════════════════════════════════════════ */

const nomContact = (c: any) =>
  c?.company || `${c?.first_name || ''} ${c?.last_name || ''}`.trim() || 'Fournisseur';

async function loadCatalog() {
  const { data } = await supabaseAdmin
    .from('products').select('id, name_fr, name_sv, ean, cost_price, stock, bundle_items').limit(1000);
  /* Les box ne s'achètent pas en magasin : les proposer au rapprochement
     faisait matcher « Kexchoklad » sur « Box Kexchoklad ». */
  const { composition } = await import('@/lib/lots');
  return (data || []).filter((p: any) => !composition(p.bundle_items));
}

async function loadAliases(store?: string) {
  const { data } = await supabaseAdmin
    .from('ticket_aliases').select('raw_label, store, product_id').limit(2000);
  const map: Record<string, string> = {};
  /* Un alias propre au magasin l'emporte sur un alias générique : les
     génériques d'abord, ceux du magasin les écrasent ensuite. En une
     seule passe, c'était le dernier lu qui gagnait. */
  for (const a of data || []) if (!a.store) map[normalize(a.raw_label)] = a.product_id;
  for (const a of data || []) if (store && a.store === store) map[normalize(a.raw_label)] = a.product_id;
  return map;
}

/**
 * Mémorise libellé de caisse → produit pour une enseigne.
 *
 * L'index unique de ticket_aliases (migration 030) porte sur des
 * EXPRESSIONS : (lower(raw_label), coalesce(store, '')). Un upsert
 * `onConflict: 'raw_label,store'` ne peut pas le désigner : Postgres
 * refusait chaque écriture (42P10), l'erreur était dans le résultat et
 * personne ne la lisait — aucun alias n'a jamais été appris. On lit donc
 * les alias de l'enseigne, puis on met à jour ou on insère, avec la même
 * clé que l'index (libellé en minuscules).
 *
 * Renvoie le nombre de libellés qui n'ont pas pu être mémorisés.
 */
async function apprendreAlias(lignes: any[], cle: string | null): Promise<number> {
  let q = supabaseAdmin.from('ticket_aliases').select('id, raw_label, product_id, hits');
  q = cle ? q.eq('store', cle) : q.is('store', null);
  const { data: connus, error } = await q.limit(5000);
  if (error) { console.error('[tickets] alias illisibles', error.message); return lignes.length; }

  const parLibelle = new Map<string, any>((connus || []).map(a => [String(a.raw_label).toLowerCase(), a]));
  const vus = new Set<string>();
  let echecs = 0;
  for (const l of lignes) {
    const libelle = String(l.raw_label || '').trim();
    if (!l.product_id || !libelle) continue;
    const k = libelle.toLowerCase();
    // Le même libellé deux fois sur un ticket : la première ligne fait foi.
    if (vus.has(k)) continue;
    vus.add(k);

    const existant = parLibelle.get(k);
    const maintenant = new Date().toISOString();
    const { error: e } = existant
      ? await supabaseAdmin.from('ticket_aliases').update({
          product_id: l.product_id,
          hits: (Number(existant.hits) || 0) + 1,
          updated_at: maintenant,
        }).eq('id', existant.id)
      : await supabaseAdmin.from('ticket_aliases').insert({
          raw_label: libelle, store: cle, product_id: l.product_id, updated_at: maintenant,
        });
    if (e) { echecs++; console.error('[tickets] alias non mémorisé', libelle, e.message); }
  }
  return echecs;
}

export async function GET(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const url = new URL(req.url);
  const labels = (url.searchParams.get('labels') || '').split('|').map(s => s.trim()).filter(Boolean);
  const store = url.searchParams.get('store') || undefined;

  if (!labels.length) {
    const { data } = await supabaseAdmin
      .from('purchase_tickets').select('*').order('created_at', { ascending: false }).limit(30);
    return NextResponse.json({ tickets: data || [] });
  }

  const [catalog, aliases] = await Promise.all([loadCatalog(), loadAliases(store)]);
  const results = labels.map(l => ({ label: l, ...matchLine(l, catalog, aliases) }));
  return NextResponse.json({ results });
}

export async function POST(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const body = await req.json().catch(() => ({} as any));
  const {
    store, purchased_at, exchange_rate, vat_rate = 6,
    total_ocr, image_urls = [], lines = [], draft = false,
    currency = 'SEK', shipping = null, supplier_id = null,
  } = body;

  if (!Array.isArray(lines) || lines.length === 0) {
    return NextResponse.json({ error: 'Aucune ligne à enregistrer' }, { status: 400 });
  }
  const rate = Number(exchange_rate);
  if (!draft && (!rate || rate <= 0)) {
    return NextResponse.json({ error: 'Taux de change manquant' }, { status: 400 });
  }
  const vat = Math.max(0, Number(vat_rate) || 0);

  /* Magasin choisi dans les fournisseurs : relu en base, jamais pris tel
     quel de l'écran — un identifiant inconnu rattacherait la commande à
     rien, ou au mauvais magasin. */
  let fournisseur: { id: string; nom: string } | null = null;
  if (supplier_id) {
    const { data: c } = await supabaseAdmin.from('contacts')
      .select('id, company, first_name, last_name').eq('id', supplier_id).maybeSingle();
    if (!c) return NextResponse.json({ error: 'Magasin introuvable parmi les fournisseurs' }, { status: 400 });
    fournisseur = { id: c.id, nom: nomContact(c) };
  }
  // Succursale en texte libre ; à défaut, le nom du magasin choisi.
  const magasin: string | null = String(store || '').trim() || fournisseur?.nom || null;
  // Clé des alias : l'enseigne (cf. en-tête).
  const cleAlias: string | null = fournisseur?.nom || magasin;

  const kept = lines.filter((l: any) => !l.ignored);
  const totalLines = lines.reduce((s: number, l: any) => s + (Number(l.qty) || 0) * (Number(l.unit_sek) || 0), 0);
  const goodsSek = kept.reduce((s: number, l: any) => s + (Number(l.qty) || 0) * (Number(l.unit_sek) || 0), 0);
  // Payé en caisse, moms comprise : c'est le coût de la marchandise.
  const goodsEur = round2(versEuros(goodsSek, rate || 0));
  // Hors moms, POUR MÉMOIRE (comptabilité) — jamais utilisé comme coût.
  const goodsEurHt = round2(goodsEur - taxeIncluse(goodsEur, vat));
  const momsEur = round2(goodsEur - goodsEurHt);

  /* ── Port du voyage ─────────────────────────────────────────────
     Un voyage = plusieurs tickets et un seul port. Réparti au prorata
     du prix sur tous les articles du voyage, il revient à chaque ticket
     en proportion de son montant (lib/cout-achat). */
  const portVoyage = Math.max(0, Number(shipping?.amount_eur) || 0);
  const achatsVoyage = Math.max(0, Number(shipping?.trip_goods) || 0);
  if (portVoyage > 0 && achatsVoyage > 0 && achatsVoyage + 0.005 < goodsSek) {
    return NextResponse.json({
      error: `Le total des achats du voyage (${achatsVoyage.toFixed(2)} ${currency}) est inférieur à ce seul ticket (${goodsSek.toFixed(2)} ${currency}) : vérifie-le, ou vide-le si le port ne concerne que ce ticket.`,
    }, { status: 400 });
  }
  const portTicket = partPortDuTicket(portVoyage, goodsSek, achatsVoyage);

  // Une quantité de stock est entière et positive (garde côté serveur).
  const qtyDe = (l: any) => Math.max(1, Math.round(Number(l.qty) || 1));
  const couts = coutsDuTicket(
    kept.map((l: any, i: number) => ({ key: String(i), qty: qtyDe(l), prix: Number(l.unit_sek) || 0 })),
    { taux: rate || 0, tauxTaxe: vat, port: portTicket },
  );

  /* Les lignes archivées gardent le coût calculé à côté du prix lu :
     le ticket se relit seul, sans refaire le calcul. */
  let k = -1;
  const lignesArchivees = lines.map((l: any) => {
    if (l.ignored) return l;
    const c = couts.lignes[String(++k)];
    return c ? {
      ...l,
      unit_cost_eur: c.unit_eur,
      moms_unit_eur: c.taxe_unit_eur,
      shipping_per_unit: c.port_unit,
      landed_unit_cost: c.revient_unit,
    } : l;
  });

  // ── Brouillon : on archive et on s'arrête là ──────────────────
  const ticketPayload = {
    store: magasin,
    purchased_at: purchased_at || null,
    currency,
    exchange_rate: rate || null,
    vat_rate: vat,
    total_ocr: total_ocr != null ? Number(total_ocr) : null,
    total_lines: Math.round(totalLines * 100) / 100,
    /* Hors moms, pour mémoire : TTC (commande d'achat) − ce montant =
       moms payée. Le coût des articles, lui, garde la moms. */
    goods_eur_ht: goodsEurHt,
    image_urls,
    lines: lignesArchivees,
    status: draft ? 'draft' : 'validated',
  };

  const { data: ticket, error: tErr } = await supabaseAdmin
    .from('purchase_tickets').insert(ticketPayload).select().single();
  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });
  if (draft) return NextResponse.json({ ok: true, ticket, draft: true });

  // ── Apprentissage des alias ───────────────────────────────────
  /* Chaque ligne validée sur un produit enseigne la correspondance.
     L'apprentissage ne bloque jamais la validation, mais un échec est
     désormais dit (avertissement) au lieu d'être avalé. */
  let aliasNonAppris = 0;
  try { aliasNonAppris = await apprendreAlias(kept, cleAlias); }
  catch (e: any) { aliasNonAppris = kept.length; console.error('[tickets] alias', e?.message); }

  // ── Commande d'achat ──────────────────────────────────────────
  /* Numérotation par le maximum de l'année, pas par le nombre total de
     commandes : deux tickets validés en même temps recevaient le même
     numéro. */
  const annee = new Date().getFullYear();
  const { data: dernier } = await supabaseAdmin.from('purchase_orders')
    .select('number').like('number', `PO-${annee}-%`).order('number', { ascending: false }).limit(1);
  const precedent = Number(String(dernier?.[0]?.number || '').split('-')[2]) || 0;
  const number = `PO-${annee}-${String(precedent + 1).padStart(3, '0')}`;

  const poLines = kept.map((l: any, i: number) => {
    const qty = qtyDe(l);
    const c = couts.lignes[String(i)];
    return {
      product_id: l.product_id || null,
      name: l.product_name || l.raw_label,
      qty,
      /* `unit_cost` en EUROS, comme sur toutes les autres commandes
         d'achat : le bon PDF, l'annulation de réception (PMP) et la
         répartition du port le lisent comme tel. Il portait le prix en
         couronnes TTC, imprimé « 32,90 € » sur le bon. Le prix du ticket
         reste dans `unit_cost_sek`. C'est le prix payé, moms comprise :
         la boutique ne la récupère pas. */
      unit_cost: c.unit_eur,
      unit_cost_eur: c.unit_eur,
      unit_cost_sek: Number(l.unit_sek) || 0,
      vat_rate: vat,
      moms_unit_eur: c.taxe_unit_eur,
      total: round2(c.unit_eur * qty),
      // Port reversé sur l'article : mêmes champs que la composition de commande.
      ...(portTicket > 0 ? {
        shipping_share: c.port_total,
        shipping_per_unit: c.port_unit,
        landed_unit_cost: c.revient_unit,
        bears_shipping: true,
      } : {}),
      /* Coût effectivement écrit sur la fiche produit (marchandise +
         port). L'annulation et le rejeu de la réception le relisent pour
         défaire ou refaire exactement ce qui a été posé. */
      stock_unit_cost: c.revient_unit,
    };
  });

  const fmt = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const notes = [
    `Ticket de caisse${magasin ? ' · ' + magasin : ''}`,
    momsEur > 0
      ? `${currency === 'EUR' ? 'TVA' : 'moms'} ${String(vat).replace('.', ',')} % ≈ ${fmt(momsEur)} € incluse dans le coût (non récupérable)`
      : '',
    portTicket > 0
      ? `port ${fmt(portTicket)} € réparti au prorata du prix`
        + (achatsVoyage > 0 ? ` (port du voyage ${fmt(portVoyage)} € pour ${fmt(achatsVoyage)} ${currency} d'achats)` : '')
      : '',
  ].filter(Boolean).join(' · ');

  const { data: po, error: poErr } = await supabaseAdmin.from('purchase_orders').insert({
    number,
    status: 'received',
    // Le magasin est rattaché : la commande paraît sur sa fiche fournisseur.
    supplier_id: fournisseur?.id || null,
    supplier_name: magasin || 'Achat magasin',
    expected_date: purchased_at || null,
    notes,
    lines: JSON.stringify(poLines),
    subtotal: goodsEur,
    shipping: portTicket,
    total: round2(goodsEur + portTicket),
    currency,
    exchange_rate: rate,
    payment_date: purchased_at || null,
  }).select().single();
  if (poErr) return NextResponse.json({ error: poErr.message }, { status: 500 });

  // Dernier achat chez ce magasin, comme le fait la composition de commande.
  if (fournisseur) {
    try {
      await supabaseAdmin.from('contacts')
        .update({ last_order_at: new Date().toISOString() }).eq('id', fournisseur.id);
    } catch { /* confort d'affichage, jamais bloquant */ }
  }

  // ── Réception ─────────────────────────────────────────────────
  let reception: any = null;
  try {
    const { data } = await supabaseAdmin.from('receptions').insert({
      number: `REC-${number.replace('PO-', '')}`,
      status: 'received',
      supplier_id: fournisseur?.id || null,
      supplier_name: magasin || 'Achat magasin',
      received_at: new Date().toISOString(),
      purchase_order_id: po.id,
      /* `received_qty` est le nom que lisent l'annulation, le rejeu et
         les coûts logistiques ; `qty_received` reste pour l'écran. */
      lines: JSON.stringify(poLines.map(l => ({ ...l, qty_expected: l.qty, qty_received: l.qty, received_qty: l.qty }))),
      notes: 'Créée depuis un ticket de caisse',
    }).select().single();
    reception = data;
  } catch { /* la réception est un confort, pas un bloquant */ }

  // ── Stock et prix d'achat ─────────────────────────────────────
  const stockErrors: string[] = [];
  const { composition } = await import('@/lib/lots');
  for (const l of poLines) {
    if (!l.product_id) continue;
    try {
      /* Une box n'a ni rayon ni prix d'achat propre (coût = sachets +
         emballage) : un ticket ne doit ni lui poser du stock ni écraser
         son coût. Ce sont ses sachets qu'on achète. */
      const { data: cible } = await supabaseAdmin.from('products')
        .select('bundle_items').eq('id', l.product_id).maybeSingle();
      if (composition((cible as any)?.bundle_items)) { stockErrors.push(`${l.name} (box)`); continue; }

      // Le coût de revient (moms comprise + port) alimente la fiche
      // produit ; la quantité, elle, passe par adjustStock — un seul
      // point d'écriture pour le stock.
      await supabaseAdmin.from('products').update({
        cost_price: l.stock_unit_cost,
      }).eq('id', l.product_id);

      const { adjustStock } = await import('@/lib/stock');
      await adjustStock(l.product_id, l.qty, {
        reason: 'reception',
        reference: number,
        note: `Ticket ${magasin || ''}`.trim(),
      });
    } catch (e: any) {
      stockErrors.push(l.name);
    }
  }

  await supabaseAdmin.from('purchase_tickets').update({
    purchase_order_id: po.id,
    reception_id: reception?.id || null,
  }).eq('id', ticket.id);

  const avertissements = [
    stockErrors.length ? `Stock non mis à jour pour : ${stockErrors.join(', ')}` : '',
    aliasNonAppris ? `${aliasNonAppris} libellé(s) non mémorisé(s) pour les prochains tickets` : '',
  ].filter(Boolean);

  return NextResponse.json({
    ok: true,
    ticket,
    purchase_order: po,
    reception,
    goods_eur: goodsEur,
    goods_eur_ht: goodsEurHt,
    moms_eur: momsEur,
    shipping_eur: portTicket,
    ...(avertissements.length ? { warning: avertissements.join(' · ') } : {}),
  });
}
