import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';
import { adjustStock } from '@/lib/stock';

/* ═══════════════════════════════════════════════════════════════
   CONTRÔLE DU STOCK

   Recalcule, pour chaque produit, ce que le stock devrait être :

       théorique = total reçu − total vendu

   « reçu » = lignes des réceptions non annulées ; « vendu » = quantités
   EXPÉDIÉES des commandes réelles (hors test, hors exclues des stats,
   hors annulées) — le stock ne bouge qu'à l'expédition. C'est la seule
   base reconstituable : les ventes n'ont longtemps laissé aucune trace
   dans le journal de stock.

   Limite honnête : un produit jamais entré par une réception n'a pas
   de théorique exploitable — son stock a été saisi à la main. Ces
   produits sont renvoyés avec `reconciliable: false` et doivent être
   comptés physiquement (Stocks › Inventaire par scan).
   ═══════════════════════════════════════════════════════════════ */

const J = (v: any): any[] => {
  try { return typeof v === 'string' ? JSON.parse(v) : (Array.isArray(v) ? v : []); }
  catch { return []; }
};

/* PostgREST plafonne une lecture à 1000 lignes (max-rows de Supabase),
   sans erreur : passé 1000 commandes, « vendu » aurait silencieusement
   perdu les autres, et « Aligner » aurait remis en rayon leur marchandise.
   On lit donc par pages, dans un ordre stable. */
async function toutLire(table: string, colonnes: string): Promise<any[]> {
  const PAGE = 1000;
  const out: any[] = [];
  for (let de = 0; ; de += PAGE) {
    const { data, error } = await supabaseAdmin.from(table).select(colonnes)
      .order('id', { ascending: true }).range(de, de + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < PAGE) return out;
  }
}

async function compute() {
  const [products, orders, receptions] = await Promise.all([
    toutLire('products', 'id, name_fr, stock, stock_alert, track_stock, sort_order, image_url'),
    toutLire('orders', 'id, order_number, status, lines, shipped_qty, is_test, exclude_from_stats'),
    toutLire('receptions', 'id, number, status, lines'),
  ]);

  const received: Record<string, number> = {};
  for (const r of receptions || []) {
    if (r.status === 'cancelled') continue;
    for (const l of J(r.lines)) {
      const q = Number(l.received_qty ?? l.qty_received ?? l.qty) || 0;
      if (l.product_id && q) received[l.product_id] = (received[l.product_id] || 0) + q;
    }
  }

  /* « Vendu » = ce qui est SORTI du rayon, exactement comme le contrôle
     quotidien (cron/stock-audit). Ce calcul comptait encore toutes les
     lignes de toutes les commandes non annulées — y compris les paniers
     abandonnés, les brouillons en attente de paiement et les commandes
     payées pas encore expédiées, qui sont toujours sur l'étagère.
     « Aligner » retirait alors du stock physique la marchandise d'un
     panier jamais payé, ou celle d'une commande qui allait de nouveau la
     sortir à l'expédition. */
  const PARTIES = ['shipped', 'delivered', 'partial'];
  const sold: Record<string, number> = {};
  /* Une box vendue a vendu ses sachets (migration 054) : sans ce
     développement, le rapprochement « corrigerait » à la hausse le stock
     de chaque sachet parti dans une box. */
  const { chargerLots } = await import('@/lib/lots');
  const lots = await chargerLots();
  for (const o of orders || []) {
    if (o.is_test || o.exclude_from_stats || o.status === 'cancelled') continue;
    const envoye = (o as any).shipped_qty || null;
    for (const l of J(o.lines)) {
      if (!l.product_id) continue;
      /* Expédition partielle : shipped_qty fait foi. Commande expédiée
         avant que cette colonne existe : tout est parti. Sinon : rien. */
      const q = envoye
        ? Number(envoye[l.product_id]) || 0
        : (PARTIES.includes(o.status) ? Number(l.qty) || 0 : 0);
      if (!q) continue;
      if (lots[l.product_id]) {
        for (const it of lots[l.product_id]) sold[it.product_id] = (sold[it.product_id] || 0) + q * it.qty;
      } else {
        sold[l.product_id] = (sold[l.product_id] || 0) + q;
      }
    }
  }

  const rows = (products || []).map(p => {
    const rec = received[p.id] || 0;
    const sol = sold[p.id] || 0;
    const theorique = rec - sol;
    const base = Number(p.stock) || 0;
    return {
      product_id: p.id,
      name: p.name_fr,
      image_url: p.image_url,
      track_stock: !!p.track_stock,
      received: rec,
      sold: sol,
      theorique,
      base,
      ecart: base - theorique,
      // Sans aucune réception, le théorique ne veut rien dire.
      reconciliable: rec > 0,
    };
  });

  rows.sort((a, b) => Math.abs(b.ecart) - Math.abs(a.ecart) || a.name.localeCompare(b.name));
  return rows;
}

export async function GET(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const rows = await compute();
  const enEcart = rows.filter(r => r.reconciliable && r.ecart !== 0);
  const aCompter = rows.filter(r => !r.reconciliable && (r.base !== 0 || r.sold !== 0));

  return NextResponse.json({
    rows,
    resume: {
      total: rows.length,
      en_ecart: enEcart.length,
      a_compter: aCompter.length,
      surstock: enEcart.filter(r => r.ecart > 0).reduce((s, r) => s + r.ecart, 0),
      sousstock: enEcart.filter(r => r.ecart < 0).reduce((s, r) => s + r.ecart, 0),
    },
  });
}

/** Aligne le stock des produits demandés sur leur valeur théorique. */
export async function POST(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body.product_ids) ? body.product_ids : [];
  if (!ids.length) return NextResponse.json({ error: 'Aucun produit à aligner' }, { status: 400 });

  const rows = await compute();
  const applied: any[] = [];
  const refused: any[] = [];

  for (const id of ids) {
    const row = rows.find(r => r.product_id === id);
    if (!row) { refused.push({ product_id: id, raison: 'produit introuvable' }); continue; }
    if (!row.reconciliable) { refused.push({ product_id: id, raison: 'aucune réception : à compter physiquement' }); continue; }
    if (row.ecart === 0) { refused.push({ product_id: id, raison: 'déjà aligné' }); continue; }

    const res = await adjustStock(id, -row.ecart, {
      reason: 'reconciliation',
      reference: `CTRL-${new Date().toISOString().slice(0, 10)}`,
      note: `Alignement sur le théorique : ${row.received} reçu − ${row.sold} vendu = ${row.theorique}`,
    });
    if (res) applied.push({ ...res, name: row.name });
  }

  return NextResponse.json({ ok: true, applied, refused });
}
