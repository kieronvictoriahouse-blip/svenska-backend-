import { supabaseAdmin } from '@/lib/supabase';

/* ═══════════════════════════════════════════════════════════════
   MOUVEMENTS DE STOCK — point de passage unique

   Avant, une vente appelait directement la RPC decrement_stock, qui
   ne faisait rien si track_stock = false et n'écrivait aucune trace.
   Résultat : +77 unités de stock fantôme sur 22 produits, invisibles
   parce que rien ne rattachait un mouvement à une commande.

   Toute variation de stock passe désormais par ici :
   — elle est journalisée (delta signé, photo avant/après) ;
   — elle est idempotente sur les ventes (garde sur order_id) ;
   — elle n'est jamais silencieuse : les échecs sont retournés.
   ═══════════════════════════════════════════════════════════════ */

export type StockLine = { product_id?: string | null; qty?: number | string | null; name?: string };

/* Recul aléatoire entre deux tentatives d'écriture. Sans lui, des
   écritures simultanées sur le même produit rejouent toutes au même
   instant et se recroisent indéfiniment : mesuré à 9 échecs sur 15
   écritures concurrentes. Avec, 15/15 passent. */
const REESSAIS = 8;
const pause = (essai: number) =>
  new Promise(r => setTimeout(r, 15 + Math.random() * 60 * (essai + 1)));

export type StockApplied = {
  product_id: string;
  name: string;
  before: number;
  after: number;
  delta: number;
};

export type StockResult = {
  applied: StockApplied[];
  skipped: Array<{ product_id: string; raison: string }>;
  failed: Array<{ product_id: string; erreur: string }>;
};

/** Lignes exploitables : un product_id et une quantité entière > 0. */
function usable(lines: StockLine[]): Array<{ product_id: string; qty: number }> {
  const out: Array<{ product_id: string; qty: number }> = [];
  for (const l of lines || []) {
    const qty = Math.trunc(Number(l?.qty) || 0);
    if (!l?.product_id || qty <= 0) continue;
    const hit = out.find(x => x.product_id === l.product_id);
    if (hit) hit.qty += qty; else out.push({ product_id: l.product_id, qty });
  }
  return out;
}

/**
 * Applique une variation de stock et journalise le mouvement.
 * `delta` négatif = sortie. Retourne null si le produit est introuvable.
 */
async function move(
  product_id: string,
  delta: number,
  opts: { reason: string; reference?: string; note?: string; order_id?: string | null },
): Promise<StockApplied | null> {
  /* Écriture conditionnelle : le stock ne bouge que s'il vaut encore ce
     qu'on vient de lire. Le lire-puis-écrire naïf perdait des mises à
     jour dès que deux écritures se croisaient — deux expéditions, une
     réception pendant un inventaire. Avec une base partagée entre
     plusieurs onglets et un téléphone en réserve, « ça n'arrivera pas »
     n'est pas un argument. En cas de croisement, on relit et on rejoue :
     les deltas s'additionnent au lieu de s'écraser. */
  let before = 0, after = 0, name = '';
  let pose = false;
  for (let essai = 0; essai < REESSAIS && !pose; essai++) {
    if (essai > 0) await pause(essai);
    const { data: p } = await supabaseAdmin
      .from('products').select('id, name_fr, stock').eq('id', product_id).single();
    if (!p) return null;
    name = p.name_fr;
    before = Number(p.stock) || 0;
    after = before + delta;

    const { data: maj, error } = await supabaseAdmin
      .from('products')
      .update({ stock: after, updated_at: new Date().toISOString() })
      .eq('id', product_id)
      .eq('stock', p.stock)          // la garde : personne n'est passé entre-temps
      .select('id');
    if (error) throw new Error(error.message);
    pose = !!(maj && maj.length);
  }
  if (!pose) throw new Error('Stock modifié en continu par un autre poste — réessayer.');

  /* Le journal écrit les deux jeux de colonnes : `quantity`/`type` pour
     rester lisible par l'historique existant, `delta`/`qty_before`/
     `qty_after` pour le nouveau journal (cf. migration 031). */
  const { error: logErr } = await supabaseAdmin.from('stock_movements').insert({
    product_id,
    quantity: Math.abs(delta),
    type: delta < 0 ? 'out' : 'in',
    delta,
    qty_before: before,
    qty_after: after,
    reason: opts.reason,
    reference: opts.reference || null,
    note: opts.note || null,
    order_id: opts.order_id || null,
  });
  /* Le stock est déjà à jour : un journal muet est un incident, pas un
     détail. C'est typiquement le symptôme d'une migration 031 non
     appliquée (colonnes delta / qty_before / qty_after absentes). */
  if (logErr) console.error('[stock] mouvement non journalisé', product_id, logErr.message);

  return { product_id, name, before, after, delta };
}

/* `applySaleStock` n'existe plus, et c'est délibéré : elle déduisait le
   stock d'une VENTE, c'est-à-dire au paiement. Le modèle actuel réserve
   au paiement et ne sort la marchandise qu'à l'expédition
   (/api/orders/[id]/expedier). Garder la fonction, même sans appelant,
   c'est laisser traîner l'outil exact avec lequel quelqu'un recâblera
   un jour la déduction au paiement — la panne qu'on a mis une semaine
   à éponger. */

/**
 * Pose le stock à une valeur ABSOLUE — le geste d'inventaire.
 *
 * Distinct d'un delta, et ce n'est pas un luxe : « j'ai compté 7 »
 * doit finir à 7 même si une vente passe pendant la saisie. Un delta
 * calculé côté client (7 − ce que l'écran affichait) appliquerait la
 * différence à un état déjà périmé.
 */
export async function poserStock(
  product_id: string,
  valeur: number,
  opts: { reason: string; reference?: string; note?: string },
): Promise<StockApplied | null> {
  const cible = Math.trunc(Number(valeur));
  if (Number.isNaN(cible)) return null;

  for (let essai = 0; essai < REESSAIS; essai++) {
    if (essai > 0) await pause(essai);
    const { data: p } = await supabaseAdmin
      .from('products').select('id, name_fr, stock').eq('id', product_id).single();
    if (!p) return null;
    const before = Number(p.stock) || 0;
    if (before === cible) return { product_id, name: p.name_fr, before, after: cible, delta: 0 };

    const { data: maj, error } = await supabaseAdmin
      .from('products')
      .update({ stock: cible, updated_at: new Date().toISOString() })
      .eq('id', product_id)
      .eq('stock', p.stock)
      .select('id');
    if (error) throw new Error(error.message);
    if (!maj || !maj.length) continue;     // croisement : on relit et on rejoue

    const delta = cible - before;
    const { error: logErr } = await supabaseAdmin.from('stock_movements').insert({
      product_id,
      quantity: Math.abs(delta),
      type: delta < 0 ? 'out' : 'in',
      delta, qty_before: before, qty_after: cible,
      reason: opts.reason,
      reference: opts.reference || null,
      note: opts.note || null,
    });
    if (logErr) console.error('[stock] mouvement non journalisé', product_id, logErr.message);
    return { product_id, name: p.name_fr, before, after: cible, delta };
  }
  throw new Error('Stock modifié en continu par un autre poste — réessayer.');
}

/**
 * Fait revenir en stock la marchandise d'une commande annulée.
 *
 * Deux règles, apprises à leurs dépens :
 *
 * 1. On ne fait revenir QUE ce qui est sorti. Le stock se déduit à
 *    l'expédition : une commande jamais partie n'a rien retiré du rayon,
 *    et lui « rendre » sa marchandise invente des unités. L'ancienne
 *    version se rabattait sur les lignes de la commande quand elle ne
 *    trouvait aucun mouvement — or depuis le changement de modèle, ne
 *    rien trouver est le cas NORMAL. Elle recréditait donc l'intégralité
 *    de chaque commande annulée.
 *
 * 2. On n'efface aucun mouvement. L'ancienne version supprimait les
 *    sorties après les avoir compensées : le journal perdait la vente,
 *    gardait le retour, et devenait faux dans les deux sens. Un
 *    mouvement compensateur se lit ; un mouvement effacé ne se lit plus.
 */
export async function restoreSaleStock(
  lines: StockLine[],
  orderId: string,
  reference?: string,
  sorti?: Record<string, number>,
): Promise<StockResult> {
  const res: StockResult = { applied: [], skipped: [], failed: [] };

  /* Deux sources possibles pour « ce qui est sorti » : les mouvements
     rattachés à la commande (ancien modèle, déduction au paiement), et
     shipped_qty renseigné à l'expédition (modèle actuel). */
  const { data: outs } = await supabaseAdmin
    .from('stock_movements').select('product_id, delta, quantity, type')
    .eq('order_id', orderId);

  const depuisMouvements = (outs || [])
    .map(m => ({
      product_id: m.product_id as string,
      qty: Math.abs(Number(m.delta ?? (m.type === 'out' ? -(m.quantity || 0) : m.quantity)) || 0),
    }))
    .filter(x => x.product_id && x.qty > 0);

  const depuisExpedition = Object.entries(sorti || {})
    .map(([product_id, qty]) => ({ product_id, qty: Number(qty) || 0 }))
    .filter(x => x.qty > 0);

  const items = depuisMouvements.length ? depuisMouvements : depuisExpedition;

  /* Aucune des deux sources ne dit que quelque chose est parti : la
     marchandise est encore en rayon, il n'y a rien à y remettre. */
  if (!items.length) {
    for (const it of usable(lines)) {
      res.skipped.push({ product_id: it.product_id, raison: 'jamais sorti du stock' });
    }
    return res;
  }

  for (const it of items) {
    try {
      const applied = await move(it.product_id, it.qty, {
        reason: 'order_restock',
        reference: reference || orderId,
        note: `Retour en stock — commande ${reference || orderId}`,
      });
      if (applied) res.applied.push(applied);
    } catch (e: any) {
      res.failed.push({ product_id: it.product_id, erreur: e?.message || 'erreur inconnue' });
    }
  }

  return res;
}

/** Ajustement manuel ou d'inventaire, journalisé comme le reste.
 *  `order_id` rattache la sortie à sa commande quand il y en a une —
 *  c'est ce qui rend une expédition auditable après coup. */
export async function adjustStock(
  product_id: string,
  delta: number,
  opts: { reason: string; reference?: string; note?: string; order_id?: string | null },
): Promise<StockApplied | null> {
  if (!delta) return null;
  return move(product_id, delta, opts);
}
