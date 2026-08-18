/* ═══════════════════════════════════════════════════════════════
   LECTURE DU JOURNAL DE STOCK

   Le journal s'est constitué en plusieurs temps et ses motifs sont
   hétérogènes : des clés machine (`picking`, `order`) côtoient des
   phrases écrites à la main (« Réception 0008 — GEKAS »). Les
   normaliser à l'écriture réécrirait le passé ; on les classe donc à
   la lecture, et le motif d'origine reste affiché tel quel.

   Un mouvement isolé ne raconte rien. Ce qui se lit, c'est la SÉANCE :
   « le 13 août, réception GEKAS, 30 articles, +187 unités ». Les
   mouvements se regroupent donc par référence quand elle existe, sinon
   par motif et par jour.
   ═══════════════════════════════════════════════════════════════ */

export type Categorie =
  | 'reception' | 'vente' | 'expedition' | 'inventaire'
  | 'remplacement' | 'controle' | 'annulation' | 'autre';

export const CATEGORIES: Record<Categorie, { label: string; sens: 'in' | 'out' | 'mixte' }> = {
  reception:    { label: 'Réception',      sens: 'in' },
  vente:        { label: 'Vente',          sens: 'out' },
  expedition:   { label: 'Expédition',     sens: 'out' },
  inventaire:   { label: 'Inventaire',     sens: 'mixte' },
  remplacement: { label: 'Remplacement',   sens: 'mixte' },
  controle:     { label: 'Contrôle',       sens: 'mixte' },
  annulation:   { label: 'Annulation',     sens: 'mixte' },
  autre:        { label: 'Autre',          sens: 'mixte' },
};

/** Classe un motif brut, quelle que soit la façon dont il a été écrit. */
export function categoriser(reason: string | null | undefined): Categorie {
  const r = String(reason || '').toLowerCase();
  if (/annulation/.test(r)) return 'annulation';
  if (/r[ée]ception|rejeu/.test(r)) return 'reception';
  if (/remplacement|replacement/.test(r)) return 'remplacement';
  if (/r[ée]conciliation|reconciliation|contr[ôo]le/.test(r)) return 'controle';
  if (/inventor|inventaire|manuel|manual/.test(r)) return 'inventaire';
  if (/picking/.test(r)) return 'expedition';
  if (/order|vente/.test(r)) return 'vente';
  return 'autre';
}

export type Mouvement = {
  id: string; product_id: string; delta: number;
  qty_before: number | null; qty_after: number | null;
  reason: string | null; reference: string | null; note: string | null;
  created_at: string;
};

export type Seance = {
  cle: string;
  categorie: Categorie;
  libelle: string;
  reference: string | null;
  date: string;
  articles: number;
  entrees: number;
  sorties: number;
  net: number;
  mouvements: Array<Mouvement & { nom: string }>;
};

/**
 * Regroupe les mouvements en séances.
 *
 * La référence prime quand elle existe : elle désigne un évènement réel
 * (une commande, un contrôle). À défaut, on regroupe par motif et par
 * jour — deux réceptions le même jour chez deux fournisseurs portent
 * des motifs différents, elles ne se mélangent donc pas.
 */
export function grouper(
  mouvements: Mouvement[],
  noms: Record<string, string>,
): Seance[] {
  const par = new Map<string, Seance>();

  for (const m of mouvements) {
    const jour = String(m.created_at).slice(0, 10);
    const categorie = categoriser(m.reason);
    const cle = m.reference ? `ref:${m.reference}` : `mot:${m.reason || '?'}:${jour}`;

    let s = par.get(cle);
    if (!s) {
      s = {
        cle, categorie,
        libelle: m.reference || m.reason || 'Mouvement',
        reference: m.reference || null,
        date: m.created_at,
        articles: 0, entrees: 0, sorties: 0, net: 0,
        mouvements: [],
      };
      par.set(cle, s);
    }

    const d = Number(m.delta) || 0;
    s.net += d;
    if (d > 0) s.entrees += d; else s.sorties += -d;
    s.mouvements.push({ ...m, nom: noms[m.product_id] || '(produit supprimé)' });
    // La date de la séance est celle de son mouvement le plus récent.
    if (m.created_at > s.date) s.date = m.created_at;
  }

  /* `Array.from` plutot que l'iteration directe : la cible de
     compilation du projet ne descend pas les iterateurs. */
  const seances = Array.from(par.values());
  for (const s of seances) {
    s.articles = new Set(s.mouvements.map((m: { product_id: string }) => m.product_id)).size;
  }

  return seances.sort((a, b) => (a.date < b.date ? 1 : -1));
}
