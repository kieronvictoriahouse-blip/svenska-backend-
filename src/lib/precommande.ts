/* ═══════════════════════════════════════════════════════════════
   PRÉ-COMMANDE (migration 065)

   Un produit en pré-commande se vend SANS contrôle de stock jusqu'à sa
   date de fin incluse (`preorder_end`, vide = sans fin). On achète la
   marchandise d'après les pré-commandes reçues, puis on expédie à
   partir de `preorder_ship_date`. Passé la date de fin, le produit
   redevient ordinaire : vendu selon son stock, comme les autres.

   Les pré-commandes payées entrent dans le réservé comme toute commande
   due (lib/reserve) : le disponible devient négatif d'autant, et c'est
   précisément la quantité qu'il reste à acheter.

   Dates comparées en AAAA-MM-JJ, comme les remises (lib/product-price).
   ═══════════════════════════════════════════════════════════════ */

import { supabaseAdmin } from '@/lib/supabase';
import { STATUTS_DUS } from '@/lib/reserve';

export type ChampsPrecommande = {
  preorder?: boolean | null;
  preorder_ship_date?: string | null;
  preorder_end?: string | null;
};

const aujourdhui = () => new Date().toISOString().slice(0, 10);
const jour = (v: any) => (v ? String(v).slice(0, 10) : '');

/** Le produit se vend-il en pré-commande aujourd'hui ? */
export function precommandeActive(p: ChampsPrecommande | null | undefined, today: string = aujourdhui()): boolean {
  if (!p || p.preorder !== true) return false;
  const fin = jour(p.preorder_end);
  return !fin || today <= fin;
}

/** Libellé ajouté au nom de la ligne de commande (Stripe, facture, e-mails, préparation). */
export const SUFFIXE_PRECOMMANDE = { fr: ' — pré-commande', en: ' — pre-order', sv: ' — förbeställning' } as const;

const J = (v: any): any[] => {
  try { return typeof v === 'string' ? JSON.parse(v) : (Array.isArray(v) ? v : []); }
  catch { return []; }
};

/**
 * Unités pré-commandées encore à servir, par produit : commandes payées
 * non expédiées (mêmes statuts que le réservé), reliquats déduits,
 * commandes de test exclues. Compte le produit tel qu'il a été vendu
 * (la box elle-même, pas ses sachets) : c'est le chiffre à acheter.
 */
export async function precommandesDues(ids: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  if (!ids.length) return out;
  const { data } = await supabaseAdmin
    .from('orders')
    .select('lines, shipped_qty, is_test')
    .in('status', STATUTS_DUS);
  for (const o of data || []) {
    if ((o as any).is_test) continue;
    const deja = (o as any).shipped_qty || {};
    for (const l of J((o as any).lines)) {
      if (!l || !ids.includes(l.product_id)) continue;
      const du = (Number(l.qty) || 0) - (Number(deja[l.product_id]) || 0);
      if (du > 0) out[l.product_id] = (out[l.product_id] || 0) + du;
    }
  }
  return out;
}
