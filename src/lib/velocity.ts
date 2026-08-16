import { supabaseAdmin } from '@/lib/supabase';

/* ═══════════════════════════════════════════════════════════════
   VÉLOCITÉ DE VENTE, CORRIGÉE DES RUPTURES

   Mesuré sur l'historique : 484 jours-produit de rupture, et 8 produits
   dont la demande réelle est sous-estimée d'au moins 50 %.

   La raison est mécanique. On ne vend pas les jours où l'on est en
   rupture. Une moyenne calendaire divise donc les ventes par des jours
   pendant lesquels vendre était impossible — elle mesure ce qu'on a
   réussi à vendre, pas ce que les clients demandaient. Commander
   là-dessus reconstitue exactement le stock qui a manqué : c'est la
   spirale de rupture.

   On reconstruit donc le stock jour par jour depuis les réceptions et
   les ventes, et on rapporte les ventes aux seuls jours où le produit
   était réellement disponible.

   Exemple réel : Mélange pour Dip Ranch OLW, 6 unités vendues, mais
   disponible 33 jours sur 104. Calendaire 0,058 u./jour, réelle 0,182 —
   3,2 fois plus. Le commander sur 0,058 garantit la rupture suivante.
   ═══════════════════════════════════════════════════════════════ */

/** Fenêtre d'observation. 8 semaines conseillées par le handoff, mais
 *  sur une boutique jeune aux ventes espacées, trop court ne mesure
 *  rien : on prend 120 jours et on pondère par la disponibilité. */
const FENETRE_JOURS = 120;

const J = (v: any): any[] => {
  try { return typeof v === 'string' ? JSON.parse(v) : (Array.isArray(v) ? v : []); }
  catch { return []; }
};

/** `Date` ou chaîne ISO → « AAAA-MM-JJ ». */
const jour = (d: any) => (d instanceof Date ? d.toISOString() : String(d)).slice(0, 10);

export type Velocite = {
  product_id: string;
  units_sold: number;
  days_in_stock: number;
  days_window: number;
  days_out: number;
  weekly: number;
  weekly_calendar: number;
};

/**
 * Recalcule la vélocité de tous les produits suivis.
 *
 * Le stock courant n'est pas rejoué : on reconstruit l'historique par
 * les mouvements connus (réceptions et ventes). Un produit jamais
 * réceptionné n'a pas d'historique exploitable — il ressort à zéro
 * plutôt qu'avec un chiffre inventé.
 */
export async function calculerVelocites(): Promise<Velocite[]> {
  const [{ data: produits }, { data: commandes }, { data: receptions }] = await Promise.all([
    supabaseAdmin.from('products').select('id, track_stock, is_active'),
    supabaseAdmin.from('orders')
      .select('lines, created_at, status, is_test, exclude_from_stats'),
    supabaseAdmin.from('receptions').select('lines, received_at, created_at, status'),
  ]);

  const debutFenetre = jour(new Date(Date.now() - FENETRE_JOURS * 86400000));
  const fin = jour(new Date());

  /* Mouvements par produit et par jour. Les réceptions comptent avant
     les ventes du même jour : on ne peut pas vendre ce qui n'est pas
     encore arrivé, mais on peut vendre ce qui arrive le matin. */
  const entrees: Record<string, Record<string, number>> = {};
  const sorties: Record<string, Record<string, number>> = {};

  const ajoute = (bac: Record<string, Record<string, number>>, id: string, d: string, q: number) => {
    (bac[id] = bac[id] || {});
    bac[id][d] = (bac[id][d] || 0) + q;
  };

  for (const r of receptions || []) {
    if (r.status === 'cancelled') continue;
    const d = jour(r.received_at || r.created_at);
    for (const l of J(r.lines)) {
      const q = Number(l.received_qty != null ? l.received_qty : l.qty) || 0;
      if (l.product_id && q > 0) ajoute(entrees, l.product_id, d, q);
    }
  }

  for (const o of commandes || []) {
    if (o.is_test || o.exclude_from_stats) continue;
    if (['cancelled', 'pending'].includes(o.status)) continue;
    const d = jour(o.created_at);
    for (const l of J(o.lines)) {
      const q = Number(l.qty) || 0;
      if (l.product_id && q > 0) ajoute(sorties, l.product_id, d, q);
    }
  }

  /* Toutes les dates, du premier mouvement connu à aujourd'hui : il faut
     rejouer AVANT la fenêtre pour connaître le stock à son ouverture. */
  const toutes = new Set<string>();
  for (const bac of [entrees, sorties]) {
    for (const parJour of Object.values(bac)) for (const d of Object.keys(parJour)) toutes.add(d);
  }
  const premier = Array.from(toutes).sort()[0] || debutFenetre;

  const jours: string[] = [];
  for (let t = +new Date(premier); t <= +new Date(fin); t += 86400000) jours.push(jour(new Date(t)));

  const suivis = (produits || []).filter(p => p.track_stock && p.is_active);
  const out: Velocite[] = [];

  for (const p of suivis) {
    const inP = entrees[p.id] || {};
    const outP = sorties[p.id] || {};

    let stock = 0;
    let vendus = 0, dispo = 0, fenetre = 0;

    for (const d of jours) {
      stock += inP[d] || 0;

      const dansFenetre = d >= debutFenetre;
      if (dansFenetre) {
        fenetre++;
        // Disponible = il y avait du stock au moment de vendre.
        if (stock > 0) dispo++;
      }

      const vente = outP[d] || 0;
      if (vente) {
        stock -= vente;
        if (dansFenetre) vendus += vente;
      }
      if (stock < 0) stock = 0;      // le passé n'est pas rejouable au négatif
    }

    /* Rapporter aux jours de disponibilité. Sans aucun jour disponible,
       on ne sait rien : mieux vaut zéro qu'un chiffre invente. */
    const hebdo = dispo > 0 ? (vendus / dispo) * 7 : 0;
    const hebdoCalendaire = fenetre > 0 ? (vendus / fenetre) * 7 : 0;

    out.push({
      product_id: p.id,
      units_sold: vendus,
      days_in_stock: dispo,
      days_window: fenetre,
      days_out: Math.max(0, fenetre - dispo),
      weekly: Math.round(hebdo * 1000) / 1000,
      weekly_calendar: Math.round(hebdoCalendaire * 1000) / 1000,
    });
  }

  return out;
}

/** Recalcule et enregistre. Appelé par le cron, et à la demande. */
export async function rafraichirVelocites(): Promise<{ produits: number; sousEstimes: number }> {
  const lignes = await calculerVelocites();
  if (!lignes.length) return { produits: 0, sousEstimes: 0 };

  const { error } = await supabaseAdmin.from('product_velocity').upsert(
    lignes.map(l => ({ ...l, computed_at: new Date().toISOString() })),
    { onConflict: 'product_id' },
  );
  if (error) throw new Error(error.message);

  // Combien de produits la moyenne calendaire aurait sous-commandés.
  const sousEstimes = lignes.filter(l =>
    l.weekly_calendar > 0 && l.weekly / l.weekly_calendar >= 1.5).length;

  return { produits: lignes.length, sousEstimes };
}
