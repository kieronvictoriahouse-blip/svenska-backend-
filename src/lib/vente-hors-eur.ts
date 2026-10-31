import type Stripe from 'stripe';
import { supabaseAdmin } from '@/lib/supabase';
import {
  normDevise, round2, jourParis, depuisMinor, tauxBce, contreValeurEur,
  champsReglementCommande, reglementDeSession, OPTS_STRIPE, type ReglementEur,
} from '@/lib/devise';
import { logSystemEvent } from '@/lib/system-events';
import { paysDestinationCommande } from '@/lib/seuil-ue';
import { BOUTIQUE_DEFAUT, codeBoutique } from '@/lib/boutique';

/* ═══════════════════════════════════════════════════════════════
   VENTE HORS EUR — contre-valeur et recette en euros (étape 3)

   SEUL module qui pose la contre-valeur EUR d'une commande hors euro et
   qui passe sa recette. Webhook, synchro, route de statut, rembourse-
   ment et rapprochement bancaire l'appellent tous : une seule logique,
   idempotente (rejouer ne double jamais une recette).

   Priorité : relevé Stripe (balance_transaction), puis taux BCE quand
   le relevé reste introuvable (48 h, ou tout de suite si l'argent est
   déjà rendu). Une vente n'est donc jamais omise.

   Une commande en EUR (Swedish Cravings) ressort immédiatement, sans
   aucun appel : son chemin reste celui d'avant.
   ═══════════════════════════════════════════════════════════════ */

export const CHAMPS_CONTRE_VALEUR = [
  'total_eur', 'montant_regle_devise', 'fx_rate', 'fx_rate_bce',
  'fx_source', 'fx_date', 'stripe_fee_eur', 'stripe_balance_tx',
] as const;

/** Les seuls champs de contre-valeur présents dans `o` (pour une mise à jour ciblée). */
export function extraireContreValeur(o: Record<string, any> | null | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!o) return out;
  for (const k of CHAMPS_CONTRE_VALEUR) if (o[k] !== undefined) out[k] = o[k];
  return out;
}

/**
 * jamais      : relevé Stripe uniquement (webhook : pas de facture au taux BCE)
 * si_ancienne : BCE si pas de session Stripe, ou après 48 h sans relevé (synchro)
 * toujours    : BCE tout de suite (remboursement : l'argent est déjà rendu)
 */
export type RepliBce = 'jamais' | 'si_ancienne' | 'toujours';

const DELAI_RELEVE_MS = 48 * 3600_000;

function historique(refunds: unknown): any[] {
  try {
    const h = typeof refunds === 'string' ? JSON.parse(refunds) : (refunds || []);
    return Array.isArray(h) ? h : [];
  } catch {
    return [];
  }
}

export async function assurerContreValeur(
  order: Record<string, any>,
  opts: { stripe?: Stripe | null; reglement?: ReglementEur | null; repliBce: RepliBce },
): Promise<{ ok: true; order: Record<string, any> } | { ok: false; raison: 'eur' | 'devise_incoherente' | 'reportee' }> {
  const devise = normDevise(order.currency);
  if (devise === 'EUR') return { ok: false, raison: 'eur' };

  // Déjà relevée : on ne la recalcule jamais (elle a pu être scellée).
  if (order.total_eur != null && Number(order.fx_rate) > 0) return { ok: true, order };

  let r: ReglementEur | null = opts.reglement ?? null;
  let session: Stripe.Checkout.Session | null = null;
  if (!r && order.stripe_session_id && opts.stripe) {
    session = await opts.stripe.checkout.sessions.retrieve(order.stripe_session_id, {}, OPTS_STRIPE).catch(() => null);
    /* Adaptive Pricing est coupé hors EUR : une session dans une autre
       devise est une anomalie. On ne convertit pas d'office (on pourrait
       sceller une facture fausse) : traitement manuel. */
    if (session?.currency && normDevise(session.currency) !== devise) {
      await logSystemEvent({
        source: 'accounting',
        level: 'error',
        message: 'Devise de la session Stripe différente de la commande',
        orderNumber: order.order_number,
        context: { devise, session: session.currency },
      });
      return { ok: false, raison: 'devise_incoherente' };
    }
    r = session ? await reglementDeSession(opts.stripe, session).catch(() => null) : null;
  }

  let champs: Record<string, any>;
  if (r) {
    champs = champsReglementCommande(r, await tauxBce(devise, r.date));
  } else {
    /* Date du PAIEMENT, jamais updated_at : le trigger orders_updated_at
       la déplace à chaque modification (expédition, remboursement, édition
       admin), ce qui daterait la vente — et son taux BCE — au mauvais jour.
       Le PaymentIntent naît à la confirmation du paiement : c'est la vraie
       date (une session de lien de paiement peut dater de 7 jours). À
       défaut, la session, puis la création de la commande. */
    const piId = typeof session?.payment_intent === 'string' ? session.payment_intent : session?.payment_intent?.id;
    const pi = piId && opts.stripe
      ? await opts.stripe.paymentIntents.retrieve(piId, {}, OPTS_STRIPE).catch(() => null)
      : null;
    const datePaiement: number | string = pi?.created
      ? pi.created * 1000
      : session?.created
        ? session.created * 1000
        : (order.created_at || Date.now());
    const ancienne = !order.stripe_session_id || Date.now() - new Date(datePaiement).getTime() >= DELAI_RELEVE_MS;
    if (!(opts.repliBce === 'toujours' || (opts.repliBce === 'si_ancienne' && ancienne))) {
      await logSystemEvent({
        source: 'accounting',
        level: 'warn',
        message: 'Contre-valeur EUR reportée',
        orderNumber: order.order_number,
        context: { devise, repli: opts.repliBce },
      });
      return { ok: false, raison: 'reportee' };
    }
    const date: string = order.fx_date || jourParis(datePaiement);
    const t = await tauxBce(devise, date);
    if (!t) return { ok: false, raison: 'reportee' };
    /* Montant réglé au paiement : orders.total a pu baisser depuis
       (remboursement avec order_modified), on le reconstitue. */
    let montantRegle: number;
    if (order.montant_regle_devise != null) montantRegle = Number(order.montant_regle_devise);
    else if (session?.amount_total != null) montantRegle = depuisMinor(session.amount_total, devise);
    else {
      let deja = 0;
      for (const x of historique(order.refunds)) if (x && x.order_modified) deja += Number(x.amount) || 0;
      montantRegle = (Number(order.total) || 0) + deja;
    }
    champs = {
      total_eur: contreValeurEur(montantRegle, t),
      montant_regle_devise: round2(montantRegle),
      fx_rate: t,
      fx_rate_bce: t,
      fx_source: 'bce',
      fx_date: date,
    };
    if (order.stripe_session_id) {
      await logSystemEvent({
        source: 'accounting',
        level: 'error',
        message: 'Contre-valeur EUR prise au taux BCE : relevé Stripe indisponible',
        orderNumber: order.order_number,
        context: { devise, taux: t, date },
      });
    }
  }

  // Garde total_eur IS NULL : une écriture concurrente n'est pas écrasée.
  const { data: maj, error } = await supabaseAdmin
    .from('orders').update(champs).eq('id', order.id).is('total_eur', null).select('id');
  if (error) {
    await logSystemEvent({
      source: 'accounting',
      level: 'error',
      message: 'Contre-valeur EUR non enregistrée',
      orderNumber: order.order_number,
      context: { code: error.code, detail: error.message },
    });
    return { ok: false, raison: 'reportee' };
  }
  if (!maj || maj.length === 0) {
    // Un autre passage l'a posée entre-temps : c'est la sienne qui fait foi.
    const { data: relue } = await supabaseAdmin.from('orders').select('*').eq('id', order.id).maybeSingle();
    if (relue && relue.total_eur != null && Number(relue.fx_rate) > 0) return { ok: true, order: { ...order, ...relue } };
    return { ok: false, raison: 'reportee' };
  }
  return { ok: true, order: { ...order, ...champs } };
}

export type ResultatVente = {
  statut: 'eur' | 'introuvable' | 'deja' | 'rattachee' | 'inscrite' | 'reportee' | 'incoherente';
  recetteId?: string;
};

/**
 * Recette EUR (et frais Stripe réels) d'une commande hors EUR.
 * Ne regarde pas is_test : c'est l'appelant qui filtre.
 */
export async function comptabiliserVenteHorsEur(
  orderId: string,
  opts: { stripe?: Stripe | null; reglement?: ReglementEur | null; repliBce: RepliBce; avecFrais?: boolean },
): Promise<ResultatVente> {
  const { data: commande } = await supabaseAdmin.from('orders').select('*').eq('id', orderId).maybeSingle();
  if (!commande) return { statut: 'introuvable' };
  const devise = normDevise(commande.currency);
  if (devise === 'EUR') return { statut: 'eur' };

  const { data: dejaRows } = await supabaseAdmin
    .from('accounting_entries').select('id')
    .eq('reference_type', 'order').eq('reference_id', commande.id).eq('type', 'income')
    .limit(1);
  if (dejaRows && dejaRows.length > 0) return { statut: 'deja', recetteId: dejaRows[0].id };

  const cv = await assurerContreValeur(commande, { stripe: opts.stripe, reglement: opts.reglement, repliBce: opts.repliBce });
  if (!cv.ok) return { statut: cv.raison === 'devise_incoherente' ? 'incoherente' : 'reportee' };
  const o = cv.order;

  const description = `Commande ${o.order_number}${o.customer_name ? ' — ' + o.customer_name : ''}`;
  const boutiqueId = o.boutique_id && codeBoutique(o.boutique_id) !== BOUTIQUE_DEFAUT ? { boutique_id: o.boutique_id } : {};
  const champsDevise = {
    currency: devise,
    amount_currency: round2(o.montant_regle_devise ?? o.total),
    fx_rate: o.fx_rate,
    fx_source: o.fx_source,
    destination_country: paysDestinationCommande(o),
  };

  /* Le versement Stripe a pu passer la vente avant nous (écriture « bank »
     portant le même txn_) : on la rattache à la commande au lieu d'en
     créer une seconde. Son montant EUR et ses frais restent ceux du versement. */
  if (o.stripe_balance_tx) {
    const { data: banque } = await supabaseAdmin
      .from('accounting_entries').select('id')
      .eq('type', 'income').eq('reference_type', 'bank').eq('stripe_balance_tx', o.stripe_balance_tx)
      .limit(1);
    if (banque && banque.length > 0) {
      const { error } = await supabaseAdmin.from('accounting_entries').update({
        reference_type: 'order',
        reference_id: o.id,
        reference_number: o.order_number,
        description,
        ...champsDevise,
        ...boutiqueId,
      }).eq('id', banque[0].id);
      if (error) {
        await logSystemEvent({
          source: 'accounting', level: 'error',
          message: 'Rattachement de la recette hors EUR impossible',
          orderNumber: o.order_number,
          context: { entry: banque[0].id, code: error.code, detail: error.message },
        });
        return { statut: 'reportee' };
      }
      return { statut: 'rattachee', recetteId: banque[0].id };
    }
  }

  // Datée au jour (Paris) du paiement, jamais au jour où on la passe.
  const date = o.fx_date || jourParis();
  const { data: recette, error } = await supabaseAdmin.from('accounting_entries').insert({
    date,
    type: 'income',
    category: o.source === 'manual' ? 'vente_directe' : 'vente_en_ligne',
    description,
    amount: round2(o.total_eur),
    ...champsDevise,
    stripe_balance_tx: o.stripe_balance_tx || null,
    reference_type: 'order',
    reference_id: o.id,
    reference_number: o.order_number,
    ...boutiqueId,
  }).select('id').single();
  if (error) {
    if (error.code === '23505' || /duplicate|unique/i.test(String(error.message || ''))) return { statut: 'deja' };
    await logSystemEvent({
      source: 'accounting', level: 'error',
      message: 'Recette hors EUR non enregistrée',
      orderNumber: o.order_number,
      context: { code: error.code, detail: error.message },
    });
    return { statut: 'reportee' };
  }

  /* Frais réels connus seulement avec un relevé Stripe. Au taux BCE, rien :
     le versement les passera en différence. */
  if (opts.avecFrais !== false && o.stripe_fee_eur != null && o.stripe_session_id) {
    const { data: fraisRows } = await supabaseAdmin
      .from('accounting_entries').select('id')
      .eq('reference_type', 'order').eq('reference_id', o.id).eq('category', 'frais_stripe')
      .limit(1);
    if (!(fraisRows && fraisRows.length > 0)) {
      const { error: errFrais } = await supabaseAdmin.from('accounting_entries').insert({
        date,
        type: 'expense',
        category: 'frais_stripe',
        description: `Frais Stripe — ${o.order_number} (réels)`,
        amount: o.stripe_fee_eur,
        stripe_balance_tx: o.stripe_balance_tx || null,
        reference_type: 'order',
        reference_id: o.id,
        reference_number: o.order_number,
        ...boutiqueId,
      });
      if (errFrais) {
        await logSystemEvent({
          source: 'accounting', level: 'warn',
          message: 'Frais Stripe hors EUR non enregistrés',
          orderNumber: o.order_number,
          context: { code: errFrais.code, detail: errFrais.message },
        });
      }
    }
  }

  return { statut: 'inscrite', recetteId: recette?.id };
}
