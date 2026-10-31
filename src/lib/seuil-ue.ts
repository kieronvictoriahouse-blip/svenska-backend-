import { supabaseAdmin } from '@/lib/supabase';
import { toutLire } from '@/lib/finance/tout-lire';
import { round2, normDevise } from '@/lib/devise';
import { logSystemEvent } from '@/lib/system-events';

/* ═══════════════════════════════════════════════════════════════
   SEUIL EUROPÉEN DES VENTES À DISTANCE (10 000 €)

   Au-delà de 10 000 € HT par an de ventes à des particuliers d'autres
   pays de l'UE (toutes boutiques confondues : SC hors France + FC), la
   TVA du pays d'arrivée s'applique et la franchise ne couvre plus ces
   ventes. Ce compteur est un GARDE-FOU en lecture seule, calculé depuis
   `orders` : il n'écrit rien sur les commandes et n'est pas la source
   légale (la comptable reste juge).
   ═══════════════════════════════════════════════════════════════ */

export const SEUIL_UE_EUR = 10000;

export const PAYS_UE = [
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'HU',
  'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK',
];

/**
 * Pays d'ARRIVÉE de la marchandise (c'est lui qui compte pour le seuil),
 * jamais le pays de facturation.
 */
export function paysDestinationCommande(o: any): string | null {
  if (!o) return null;
  if (o.delivery_mode === 'mondial_relay') {
    const p = String(o.relay_point_pays || '').trim().toUpperCase();
    return p || null;
  }
  if (o.delivery_mode === 'pickup') return 'FR';
  const segments = String(o.shipping_address || '').split(',');
  const dernier = String(segments[segments.length - 1] || '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(dernier) ? dernier : null;
}

function historique(refunds: unknown): any[] {
  try {
    const h = typeof refunds === 'string' ? JSON.parse(refunds) : (refunds || []);
    return Array.isArray(h) ? h : [];
  } catch {
    return [];
  }
}

/**
 * Net encaissé d'une commande, en EUR.
 * EUR : même règle que netDe de scripts/audit-facturation.js (un
 * remboursement avec order_modified est DÉJÀ retiré du total).
 * Hors EUR : total_eur (jamais réécrit) moins l'EUR rendu ; null tant
 * que la contre-valeur n'est pas relevée.
 */
export function netEurCommande(o: any): number | null {
  if (normDevise(o?.currency) === 'EUR') {
    const total = Number(o.total) || 0;
    const rembourse = Number(o.refunded_amount) || 0;
    if (o.status === 'refunded' && rembourse === 0) return 0;
    let dejaDansTotal = 0;
    for (const r of historique(o.refunds)) {
      if (r && r.order_modified) dejaDansTotal += Number(r.amount) || 0;
    }
    return total - (rembourse - dejaDansTotal);
  }
  if (o.total_eur == null) return null;
  const taux = Number(o.fx_rate) || 0;
  let rendu = 0;
  for (const r of historique(o.refunds)) {
    if (!r) continue;
    const eur = r.amount_eur != null ? Number(r.amount_eur) : (Number(r.amount) || 0) * taux;
    rendu += Math.abs(Number(eur) || 0);
  }
  return round2(Number(o.total_eur) - rendu);
}

/** Ventes à distance UE (hors France) d'une année civile, en EUR, toutes boutiques. */
export async function ventesDistanceUe(annee: number): Promise<{
  annee: number;
  total_eur: number;
  par_pays: Record<string, number>;
  commandes: number;
  sans_contre_valeur: string[];
  pays_inconnu: number;
}> {
  // Le 1er janvier est toujours en heure d'hiver à Paris (UTC+1).
  const debut = `${annee}-01-01T00:00:00+01:00`;
  const fin = `${annee + 1}-01-01T00:00:00+01:00`;

  // Mêmes filtres que la synchro comptable (tests et commandes exclues des stats).
  const lignes = await toutLire<any>(() => supabaseAdmin
    .from('orders')
    .select('id, order_number, status, total, refunded_amount, refunds, currency, total_eur, fx_rate, delivery_mode, relay_point_pays, shipping_address, created_at')
    .in('status', ['paid', 'confirmed', 'shipped', 'delivered', 'refunded'])
    .or('is_test.is.null,is_test.eq.false')
    .or('exclude_from_stats.is.null,exclude_from_stats.eq.false')
    .gte('created_at', debut)
    .lt('created_at', fin)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true }));

  let total = 0;
  let commandes = 0;
  let paysInconnu = 0;
  const parPays: Record<string, number> = {};
  const sansContreValeur: string[] = [];

  for (const o of lignes) {
    const net = netEurCommande(o);
    // EUR inconnu : signalé quelle que soit la destination, pour ne rien rater.
    if (net == null) { sansContreValeur.push(String(o.order_number || o.id)); continue; }
    const pays = paysDestinationCommande(o);
    if (!pays) { paysInconnu++; continue; }
    if (!PAYS_UE.includes(pays) || pays === 'FR') continue;
    total += net;
    parPays[pays] = (parPays[pays] || 0) + net;
    commandes++;
  }

  for (const p of Object.keys(parPays)) parPays[p] = round2(parPays[p]);

  return {
    annee,
    total_eur: round2(total),
    par_pays: parPays,
    commandes,
    sans_contre_valeur: sansContreValeur,
    pays_inconnu: paysInconnu,
  };
}

type EtatSeuil = {
  annee: number;
  courante_eur: number;
  precedente_eur: number;
  seuil: number;
  ratio: number;
  niveau: 'ok' | 'alerte' | 'bloque';
};

let cacheEtat: { at: number; etat: EtatSeuil } | null = null;

/**
 * État du seuil : année en cours ET année précédente (dépasser l'une
 * suffit). Alerte à 75 %, blocage du checkout non-sc à 95 %.
 * Mis en cache 10 minutes ; les erreurs remontent à l'appelant.
 */
export async function etatSeuilUe(maintenant: Date = new Date()): Promise<EtatSeuil> {
  const annee = Number(new Date(maintenant).toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' }).slice(0, 4));
  if (cacheEtat && cacheEtat.etat.annee === annee && Date.now() - cacheEtat.at < 10 * 60_000) {
    return cacheEtat.etat;
  }
  const [courante, precedente] = await Promise.all([ventesDistanceUe(annee), ventesDistanceUe(annee - 1)]);

  // Uniquement des commandes hors EUR non converties : jamais le cas de SC.
  const manquantes = [...courante.sans_contre_valeur, ...precedente.sans_contre_valeur];
  if (manquantes.length) {
    await logSystemEvent({
      source: 'accounting',
      level: 'warn',
      message: 'Seuil européen : commandes hors EUR sans contre-valeur, compteur incomplet',
      context: { commandes: manquantes.slice(0, 50), nombre: manquantes.length },
    });
  }

  const ratio = Math.max(courante.total_eur, precedente.total_eur) / SEUIL_UE_EUR;
  const etat: EtatSeuil = {
    annee,
    courante_eur: courante.total_eur,
    precedente_eur: precedente.total_eur,
    seuil: SEUIL_UE_EUR,
    ratio,
    niveau: ratio >= 0.95 ? 'bloque' : ratio >= 0.75 ? 'alerte' : 'ok',
  };
  cacheEtat = { at: Date.now(), etat };
  return etat;
}
