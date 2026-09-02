import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';
import { matchLine, normalize, lineEurHt } from '@/lib/ticket-match';

/* ═══════════════════════════════════════════════════════════════
   TICKETS DE CAISSE

   GET    ?labels=a|b|c&store=…  → rapproche des libellés au catalogue
   POST   { action: 'finalize' } → crée commande d'achat + réception,
                                   met à jour stock et prix d'achat,
                                   apprend les alias, archive le ticket
   ═══════════════════════════════════════════════════════════════ */

async function loadCatalog() {
  const { data } = await supabaseAdmin
    .from('products').select('id, name_fr, name_sv, ean, cost_price, stock').limit(1000);
  return data || [];
}

async function loadAliases(store?: string) {
  const { data } = await supabaseAdmin
    .from('ticket_aliases').select('raw_label, store, product_id').limit(2000);
  const map: Record<string, string> = {};
  for (const a of data || []) {
    // Un alias propre au magasin l'emporte sur un alias générique.
    if (!a.store || a.store === store) map[normalize(a.raw_label)] = a.product_id;
  }
  return map;
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
    store, purchased_at, exchange_rate, vat_rate = 12,
    total_ocr, image_urls = [], lines = [], draft = false,
    currency = 'SEK',
  } = body;

  if (!Array.isArray(lines) || lines.length === 0) {
    return NextResponse.json({ error: 'Aucune ligne à enregistrer' }, { status: 400 });
  }
  const rate = Number(exchange_rate);
  if (!draft && (!rate || rate <= 0)) {
    return NextResponse.json({ error: 'Taux de change manquant' }, { status: 400 });
  }

  const kept = lines.filter((l: any) => !l.ignored);
  const totalLines = lines.reduce((s: number, l: any) => s + (Number(l.qty) || 0) * (Number(l.unit_sek) || 0), 0);
  const goodsSek = kept.reduce((s: number, l: any) => s + (Number(l.qty) || 0) * (Number(l.unit_sek) || 0), 0);
  const goodsEur = lineEurHt(goodsSek, Number(vat_rate), rate || 0);

  // ── Brouillon : on archive et on s'arrête là ──────────────────
  const ticketPayload = {
    store: store || null,
    purchased_at: purchased_at || null,
    currency,
    exchange_rate: rate || null,
    vat_rate: Number(vat_rate),
    total_ocr: total_ocr != null ? Number(total_ocr) : null,
    total_lines: Math.round(totalLines * 100) / 100,
    goods_eur_ht: goodsEur,
    image_urls,
    lines,
    status: draft ? 'draft' : 'validated',
  };

  const { data: ticket, error: tErr } = await supabaseAdmin
    .from('purchase_tickets').insert(ticketPayload).select().single();
  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });
  if (draft) return NextResponse.json({ ok: true, ticket, draft: true });

  // ── Apprentissage des alias ───────────────────────────────────
  // Chaque ligne validée sur un produit enseigne la correspondance.
  for (const l of kept) {
    if (!l.product_id || !l.raw_label) continue;
    try {
      await supabaseAdmin.from('ticket_aliases').upsert({
        raw_label: l.raw_label,
        store: store || null,
        product_id: l.product_id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'raw_label,store', ignoreDuplicates: false });
    } catch { /* l'apprentissage ne doit jamais bloquer la validation */ }
  }

  // ── Commande d'achat ──────────────────────────────────────────
  const { count } = await supabaseAdmin
    .from('purchase_orders').select('id', { count: 'exact', head: true });
  const number = `PO-${new Date().getFullYear()}-${String((count || 0) + 1).padStart(3, '0')}`;

  const poLines = kept.map((l: any) => {
    const qty = Number(l.qty) || 1;
    const unitEur = rate ? (Number(l.unit_sek) || 0) / (1 + Number(vat_rate) / 100) * rate : 0;
    return {
      product_id: l.product_id || null,
      name: l.product_name || l.raw_label,
      qty,
      unit_cost: Number(l.unit_sek) || 0,
      unit_cost_eur: Math.round(unitEur * 10000) / 10000,
      total: Math.round(unitEur * qty * 100) / 100,
    };
  });

  const { data: po, error: poErr } = await supabaseAdmin.from('purchase_orders').insert({
    number,
    status: 'received',
    supplier_name: store || 'Achat magasin',
    expected_date: purchased_at || null,
    notes: `Ticket de caisse${store ? ' · ' + store : ''}`,
    lines: JSON.stringify(poLines),
    subtotal: goodsEur,
    total: goodsEur,
    currency,
    exchange_rate: rate,
    payment_date: purchased_at || null,
  }).select().single();
  if (poErr) return NextResponse.json({ error: poErr.message }, { status: 500 });

  // ── Réception ─────────────────────────────────────────────────
  let reception: any = null;
  try {
    const { data } = await supabaseAdmin.from('receptions').insert({
      number: `REC-${number.replace('PO-', '')}`,
      status: 'received',
      supplier_name: store || 'Achat magasin',
      received_at: new Date().toISOString(),
      purchase_order_id: po.id,
      lines: JSON.stringify(poLines.map(l => ({ ...l, qty_expected: l.qty, qty_received: l.qty }))),
      notes: 'Créée depuis un ticket de caisse',
    }).select().single();
    reception = data;
  } catch { /* la réception est un confort, pas un bloquant */ }

  // ── Stock et prix d'achat ─────────────────────────────────────
  const stockErrors: string[] = [];
  for (const l of poLines) {
    if (!l.product_id) continue;
    try {
      // Le PA HT calculé alimente la fiche produit ; la quantité, elle,
      // passe par adjustStock — un seul point d'écriture pour le stock.
      await supabaseAdmin.from('products').update({
        cost_price: l.unit_cost_eur,
      }).eq('id', l.product_id);

      const { adjustStock } = await import('@/lib/stock');
      await adjustStock(l.product_id, l.qty, {
        reason: 'reception',
        reference: number,
        note: `Ticket ${store || ''}`.trim(),
      });
    } catch (e: any) {
      stockErrors.push(l.name);
    }
  }

  await supabaseAdmin.from('purchase_tickets').update({
    purchase_order_id: po.id,
    reception_id: reception?.id || null,
  }).eq('id', ticket.id);

  return NextResponse.json({
    ok: true,
    ticket,
    purchase_order: po,
    reception,
    goods_eur_ht: goodsEur,
    ...(stockErrors.length ? { warning: `Stock non mis à jour pour : ${stockErrors.join(', ')}` } : {}),
  });
}
