import { supabaseAdmin } from '@/lib/supabase';
import { round2, tauxBce, contreValeurEur } from '@/lib/devise';

const API_URL = process.env.LOGSPHER_API_URL || 'https://upelgo.com';

function getApiKey() {
  const key = process.env.LOGSPHER_API_KEY;
  if (!key) throw new Error('LOGSPHER_API_KEY manquante dans les variables d\'environnement');
  return key;
}

async function apiFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  /* 402 = charge valide mais compte UGO sans crédit / moyen de paiement :
     UGO renvoie un lien pour régler l'étiquette (cas SD-0150, 23/09/2026).
     ⚠️ À ce stade UGO a DÉJÀ réservé l'envoi : une fois le lien payé,
     l'étiquette est générée côté UGO mais toute relance ici renvoie 412
     « already used and shipped » (voir ci-dessous). Le mieux est de créditer
     le compte UGO pour que /ship passe du premier coup. */
  if (res.status === 402) {
    let link = '';
    try { link = JSON.parse(text).payment_link || ''; } catch { /* texte brut */ }
    throw new Error(`Paiement UGO requis : règle l'étiquette via ce lien PUIS récupère le PDF + le suivi sur upelgo.com (section Envois) et colle-les dans la commande. Pour que ça passe tout seul, crédite le compte UGO. ${link}`.trim());
  }
  /* 412 = l'order_id a déjà servi et l'envoi est déjà expédié côté UGO
     (typiquement après un 402 payé via le lien). Impossible d'en recréer
     un ; l'étiquette payée est à récupérer sur le tableau de bord UGO. */
  if (res.status === 412) {
    let err = '';
    try { err = JSON.parse(text).error || ''; } catch { /* texte brut */ }
    if (/already used|already shipped/i.test(err)) {
      throw new Error("Étiquette déjà payée et générée chez UGO pour cette commande. Récupère le PDF et le numéro de suivi sur upelgo.com (section Envois), puis colle-les dans « Étiquette déjà payée » ci-dessous.");
    }
    throw new Error(`LogSpher ${path} → 412: ${text}`);
  }
  if (!res.ok) throw new Error(`LogSpher ${path} → ${res.status}: ${text}`);
  return JSON.parse(text);
}

// Parse "12 Rue Example, 75001 Paris, FR" into components
function parseAddress(full: string) {
  const parts = full.split(',').map(p => p.trim()).filter(Boolean);
  if (!parts.length) return { address1: '', postcode: '', city: '', country: 'FR' };

  let country = 'FR';
  let rest = parts;

  const last = parts[parts.length - 1];
  if (/^[A-Z]{2}$/.test(last)) {
    country = last;
    rest = parts.slice(0, -1);
  } else if (/^(france|sweden|belgique|germany|spain|italy)$/i.test(last)) {
    const map: Record<string, string> = { france: 'FR', sweden: 'SE', belgique: 'BE', germany: 'DE', spain: 'ES', italy: 'IT' };
    country = map[last.toLowerCase()] || 'FR';
    rest = parts.slice(0, -1);
  }

  let postcode = '';
  let city = '';
  let address1Parts: string[] = [];

  for (let i = 0; i < rest.length; i++) {
    const m = rest[i].match(/^(\d{4,5})\s+(.+)$/);
    if (m) {
      postcode = m[1];
      city = m[2];
      address1Parts = rest.slice(0, i);
      break;
    }
    address1Parts.push(rest[i]);
  }

  if (!postcode) {
    const m = (rest[rest.length - 1] || '').match(/(\d{4,5})\s+(.+)/);
    if (m) {
      postcode = m[1];
      city = m[2];
      address1Parts = rest.slice(0, -1);
    }
  }

  return {
    address1: address1Parts.join(', ') || rest[0] || '',
    postcode,
    city,
    country,
  };
}

export interface LogspherLabelResult {
  shipment_id: number;
  tracking_number: string;
  label_url: string;
  carrier_name: string;
  carrier_code: string;
}

/* ── Poids du colis ────────────────────────────────────────────────
   Le poids declare determine la tranche tarifaire du transporteur.
   L'ancien calcul comptait 500 g PAR ARTICLE : trois sachets de bonbons
   etaient declares a 1,5 kg. Releve du 14/09/2026 sur la grille reelle
   Etoile-sur-Rhone -> Paris : 0,5 kg = 3,97 EUR HT, 1,5 kg = 6,04 EUR HT.
   On payait donc ~2 EUR de trop sur chaque expedition, alors que la
   boutique ne facture que 4,90 EUR au client.

   On declare desormais le poids reel du catalogue. Sous-declarer serait
   pire que sur-declarer — le transporteur repese et facture un
   ajustement — d'ou la tare d'emballage et l'arrondi au dessus. */
// Carton + calage. Réglable (LOGSPHER_TARE_G) une fois un carton type pesé.
const TARE_EMBALLAGE_G = Number(process.env.LOGSPHER_TARE_G) || 200;
const POIDS_INCONNU_G  = 150;   // produit sans poids renseigne

/** « 78g », « 150 g », « 16x22g » → grammes. 0 si illisible. */
export function poidsEnGrammes(brut: string | null | undefined): number {
  const t = String(brut || '').trim().toLowerCase().replace(/^\d+\s*[x×]\s*/, '');
  const m = t.match(/([\d.,]+)\s*(kg|g)?/);
  if (!m) return 0;
  const n = parseFloat(m[1].replace(',', '.'));
  if (!(n > 0)) return 0;
  return m[2] === 'kg' ? Math.round(n * 1000) : Math.round(n);
}

/** Poids total du colis, en grammes, tare comprise. */
async function poidsDuColis(lines: Array<{ qty?: number; [k: string]: any }>): Promise<number> {
  const ids = Array.from(new Set((lines || []).map(l => l.product_id || l.id).filter(Boolean)));
  const poidsParId: Record<string, number> = {};
  if (ids.length) {
    const { data } = await supabaseAdmin.from('products').select('id,weight').in('id', ids);
    for (const p of (data || [])) poidsParId[p.id] = poidsEnGrammes(p.weight);
  }
  let total = 0;
  for (const l of (lines || [])) {
    const g = poidsParId[l.product_id || l.id] || POIDS_INCONNU_G;
    total += g * (l.qty || 1);
  }
  const avecTare = total + TARE_EMBALLAGE_G;
  /* Arrondi aux 10 g supérieurs, plancher à 300 g. L'ancien arrondi aux
     100 g ajoutait jusqu'à 99 g fictifs et faisait franchir une tranche
     (ex. 993 g déclarés 1,1 kg → tranche 1–2 kg au lieu de ≤ 1 kg). */
  return Math.max(300, Math.ceil(avecTare / 10) * 10);
}

/* ── Relire un envoi existant ──────────────────────────────────────
   GET /api/order/reference/{orderId} (doc officielle UGO, openApiDoc.yaml
   du dashboard) renvoie l'envoi à partir de NOTRE numéro de commande :
   suivi, URL publique du PDF, transporteur. C'est ce qui manquait après
   un 402 réglé via le lien : l'étiquette existait chez UGO, l'appli ne
   savait pas la relire (cas SD-0146, 25/09/2026).
   Renvoie null si UGO ne connaît pas la commande ou n'a pas encore de suivi. */
export interface LogspherExistingOrder extends LogspherLabelResult {
  is_shipped: boolean;
  is_cancel: boolean;
  delivery_date: string | null;
}

export async function fetchLogspherOrder(orderNumber: string): Promise<LogspherExistingOrder | null> {
  if (!orderNumber) return null;
  const res = await fetch(`${API_URL}/api/order/reference/${encodeURIComponent(orderNumber)}`, {
    headers: { Authorization: `Bearer ${getApiKey()}`, Accept: 'application/json' },
  });
  if (res.status === 404) return null;
  const text = await res.text();
  if (!res.ok) throw new Error(`LogSpher /api/order/reference → ${res.status}: ${text.slice(0, 200)}`);
  let j: any;
  try { j = JSON.parse(text); } catch { return null; }
  if (!j || j.is_cancel) return null;
  const tracking = String(j.tracking_number || '').trim();
  const waybill = String(j.waybill || '').trim();
  if (!tracking && !waybill) return null;   // envoi réservé mais pas encore généré (402 non réglé)
  return {
    shipment_id:   Number(j.shipment_id) || 0,
    tracking_number: tracking,
    label_url:     waybill,
    carrier_name:  j.carrier_name || j.service_name || '',
    carrier_code:  j.service_code || '',
    is_shipped:    !!j.is_shipped,
    is_cancel:     !!j.is_cancel,
    delivery_date: j.delivery_date || null,
  };
}

/* ── Référence UGO d'une commande ─────────────────────────────────
   UGO identifie un envoi par l'order_id envoyé à /ship : notre numéro de
   commande. Mais il refuse de réutiliser un order_id déjà consommé, même
   par une étiquette ANNULÉE (412 « already used and shipped », cas
   SD-0238, 23/11/2026). Une nouvelle étiquette passe alors sous
   SD-0238-2, puis -3… */
export type EtatReferenceUgo = 'inconnue' | 'annulee' | 'active';

export async function etatReferenceUgo(ref: string): Promise<EtatReferenceUgo> {
  const res = await fetch(`${API_URL}/api/order/reference/${encodeURIComponent(ref)}`, {
    headers: { Authorization: `Bearer ${getApiKey()}`, Accept: 'application/json' },
  });
  if (res.status === 404) return 'inconnue';
  const text = await res.text();
  if (!res.ok) throw new Error(`LogSpher /api/order/reference → ${res.status}: ${text.slice(0, 200)}`);
  let j: any;
  try { j = JSON.parse(text); } catch { return 'inconnue'; }
  if (!j || !j.order_id) return 'inconnue';
  return j.is_cancel ? 'annulee' : 'active';
}

/** Parcourt SD-0238, SD-0238-2, -3… : renvoie la première référence encore
    active chez UGO (à relire/annuler, jamais à repayer), sinon la première
    libre pour une nouvelle étiquette. */
export async function referenceUgo(orderNumber: string): Promise<{ active: string | null; libre: string | null }> {
  for (let i = 1; i <= 9; i++) {
    const ref = i === 1 ? orderNumber : `${orderNumber}-${i}`;
    const etat = await etatReferenceUgo(ref);
    if (etat === 'active') return { active: ref, libre: null };
    if (etat === 'inconnue') return { active: null, libre: ref };
  }
  throw new Error(`Déjà 9 étiquettes UGO annulées pour ${orderNumber} : crée la suivante sur upelgo.com.`);
}

/** Annule l'étiquette UGO d'une commande (passage en Click & Collect,
    commande annulée). UGO l'identifie par l'order_id envoyé à /ship :
    notre numéro de commande, ou SD-0238-2… (voir referenceUgo). */
export async function cancelLogspherLabel(orderNumber: string): Promise<void> {
  const res = await apiFetch('/api/carrier/cancel', {
    method: 'POST',
    body: JSON.stringify({ order_id: orderNumber }),
  });
  if (!res?.success) throw new Error('Annulation LogSpher refusée: ' + JSON.stringify(res));
}

export async function createLogspherRelayLabel(
  order: {
    order_number: string;
    customer_name: string;
    customer_email: string;
    customer_phone?: string;
    relay_point_id?: string;
    relay_point_name?: string;
    relay_point_address?: string;
    relay_point_pays?: string;
    relay_carrier_uuid?: string;
    lines: Array<{ qty?: number; [key: string]: any }>;
    total: number;
    /** Poids réel pesé (g), saisi dans l'admin ; remplace l'estimation catalogue. */
    weight_grams?: number;
    /** order_id envoyé à UGO quand le numéro de commande est déjà consommé (voir referenceUgo). */
    ugo_reference?: string;
    /** Devise de la commande (absente ou EUR = Swedish Cravings, inchangé). */
    currency?: string;
    /** Contre-valeur EUR relevée au paiement (hors EUR). */
    total_eur?: number | null;
    /** Valeur en EUR d'une unité de la devise (hors EUR). */
    fx_rate?: number | null;
  },
  wlConfig: {
    address?: string;
    site_name?: string;
    email?: string;
    phone?: string;
  }
): Promise<LogspherLabelResult> {
  /* Valeur déclarée à UGO : toujours en EUR. Hors EUR, contre-valeur
     relevée au paiement, sinon total × taux de la vente, sinon taux BCE.
     Calculée AVANT /rate : on échoue avant d'avoir réservé quoi que ce
     soit chez UGO. En EUR, valeur = order.total, comme avant. */
  const horsEur = !!order.currency && order.currency.toUpperCase() !== 'EUR';
  let valeur = order.total;
  if (horsEur) {
    let v: number | null = order.total_eur ?? (Number(order.fx_rate) > 0 ? round2(order.total * Number(order.fx_rate)) : null);
    if (v == null) {
      const t = await tauxBce(order.currency!);
      v = t ? contreValeurEur(order.total, t) : null;
    }
    if (v == null) throw new Error('Contre-valeur EUR introuvable pour la valeur déclarée UGO');
    valeur = v;
  }

  const shipFrom = parseAddress(wlConfig.address || '');

  // Adresse du client = adresse du point relais (c'est là que la livraison va)
  const relayAddress = order.relay_point_address
    ? parseAddress(order.relay_point_address)
    : { address1: '', postcode: '', city: '', country: order.relay_point_pays || 'FR' };

  const nameParts = (order.customer_name || '').trim().split(/\s+/);
  const lastname = nameParts[0] || '';
  const firstname = nameParts.slice(1).join(' ') || lastname;

  const totalQty = (order.lines || []).reduce((acc, l) => acc + (l.qty || 1), 0);
  const weightGrams = order.weight_grams && order.weight_grams > 0
    ? Math.round(order.weight_grams)
    : await poidsDuColis(order.lines || []);

  const destCountry = (relayAddress.country || order.relay_point_pays || 'FR').slice(0, 2).toUpperCase();

  const baseShipment = {
    id: 1,
    type: 2,
    shipment_date: new Date().toISOString().split('T')[0],
    delivery_type: 'DELIVERY_TO_COLLECTION_POINT',
    dropoff: true,
    content: 'Produits alimentaires suedois',
    reason: 'Commercial',
    insurance: false,
  };

  /* UGO refuse /ship (400 « Cette valeur ne doit pas être vide ») si
     ship_from.phone est vide — cas SD-0150 le 23/09/2026 : le téléphone
     de la marque blanche n'était pas renseigné. On échoue ici avec un
     message actionnable plutôt qu'avec le JSON brut de l'API. */
  const senderPhone = (wlConfig.phone || process.env.LOGSPHER_SENDER_PHONE || '').trim();
  if (!senderPhone) {
    throw new Error('Téléphone expéditeur manquant : renseigner le téléphone dans Admin › Marque blanche (ou LOGSPHER_SENDER_PHONE).');
  }

  const baseShipFrom = {
    pro: true,
    country_code: shipFrom.country.slice(0, 2),
    postcode: shipFrom.postcode,
    city: shipFrom.city,
    address1: shipFrom.address1,
    company: wlConfig.site_name || '',
    lastname: wlConfig.site_name || '',
    email: wlConfig.email || '',
    phone: senderPhone,
  };

  // ship_to = adresse du client (pour l'identification)
  // UGO exige aussi ship_to.company non vide, même pour un particulier :
  // on y met le nom du client.
  const baseShipTo = {
    pro: false,
    country_code: destCountry,
    postcode: relayAddress.postcode,
    city: relayAddress.city,
    address1: relayAddress.address1,
    company: (order.customer_name || '').trim() || order.relay_point_name || lastname,
    lastname,
    firstname,
    email: order.customer_email || '',
    phone: order.customer_phone || '',
  };

  // dropoff_to = point relais de destination
  const dropoffTo = {
    country_code: destCountry,
    postcode: relayAddress.postcode,
    city: relayAddress.city,
    address1: relayAddress.address1,
    company: order.relay_point_name || '',
    lastname,
    dropoff_location_id: order.relay_point_id || '',
  };

  const weightKg = weightGrams / 1000;
  const baseParcels = [
    { number: 1, weight: weightKg, volumetric_weight: weightKg, x: 30, y: 20, z: 15 },
  ];

  /* ── Le tarif et l'etiquette n'acceptent PAS les memes champs ──────
     /rate ne veut qu'une zone d'expedition : pays, code postal, ville,
     et le fait que l'on soit professionnel. Lui envoyer une adresse
     complete, un contenu ou un motif — qui n'ont de sens que pour
     l'etiquette — le fait repondre 400 « This field was not expected ».
     C'est ce qui bloquait toutes les expeditions : 13 champs refuses,
     zero etiquette generee depuis la mise en place.
     Verifie le 14/09/2026 : la charge ci-dessous renvoie bien 200.
     Toute nouvelle donnee va dans la charge /ship, jamais ici. */
  const rateShipment = {
    id: 1,
    type: 2,
    shipment_date: baseShipment.shipment_date,
    delivery_type: 'DELIVERY_TO_COLLECTION_POINT',
  };
  const rateShipFrom = {
    pro: true,
    country_code: baseShipFrom.country_code,
    postcode: baseShipFrom.postcode,
    city: baseShipFrom.city,
  };
  const rateShipTo = {
    pro: false,
    country_code: baseShipTo.country_code,
    postcode: baseShipTo.postcode,
    city: baseShipTo.city,
  };
  const chargeTarif = {
    order_id: order.ugo_reference || order.order_number,
    shipment: rateShipment,
    ship_from: rateShipFrom,
    ship_to: rateShipTo,
    parcels: baseParcels,
  };

  // Step 1: obtenir le tarif — via le carrier UUID du point relais choisi si disponible, sinon multi-rate
  let best: any;
  if (order.relay_carrier_uuid) {
    // Le client a choisi un point relais d'un carrier spécifique → on utilise ce carrier directement
    const rateRes = await apiFetch(`/api/carrier/${order.relay_carrier_uuid}/rate`, {
      method: 'POST',
      body: JSON.stringify(chargeTarif),
    });
    if (!rateRes.success || !Array.isArray(rateRes.offers) || !rateRes.offers.length) {
      throw new Error('Aucune offre pour ce carrier: ' + JSON.stringify(rateRes.errors || {}));
    }
    best = rateRes.offers[0];
  } else {
    // Fallback multi-rate → moins cher
    const rateRes = await apiFetch('/api/carrier/multi-rate', {
      method: 'POST',
      body: JSON.stringify(chargeTarif),
    });
    if (!rateRes.success || !Array.isArray(rateRes.offers) || !rateRes.offers.length) {
      throw new Error('Aucune offre LogSpher disponible: ' + JSON.stringify(rateRes.errors || {}));
    }
    const offers = [...rateRes.offers].sort((a: any, b: any) => (a.price_te ?? 0) - (b.price_te ?? 0));
    best = offers[0];
  }

  // Step 2: créer l'étiquette
  const shipRes = await apiFetch('/api/carrier/ship', {
    method: 'POST',
    body: JSON.stringify({
      order_id: order.ugo_reference || order.order_number,
      process_shipment: true,
      shipment: {
        ...baseShipment,
        service_id: best.service_id,
        service_code: best.service_code,
        label_format: 'PDF',
      },
      ship_from: baseShipFrom,
      ship_to: baseShipTo,
      dropoff_to: dropoffTo,
      parcels: baseParcels,
      products: [
        {
          number:      totalQty,
          currency:    'EUR',
          value:       valeur,
          value_eur:   valeur,
          description: 'Produits alimentaires suedois',
          country_code: 'FR',
        },
      ],
    }),
  });

  if (!shipRes.success) {
    throw new Error('Erreur création étiquette LogSpher: ' + JSON.stringify(shipRes.errors || {}));
  }

  return {
    shipment_id: shipRes.shipment_id || 0,
    tracking_number: shipRes.tracking_numbers?.[0] || '',
    label_url: shipRes.waybills_uri?.[0] || shipRes.waybills?.[0] || '',
    carrier_name: shipRes.carrier_name || best.carrier_name || '',
    carrier_code: shipRes.carrier_code || best.carrier_code || '',
  };
}

/* ═══════════════════════════════════════════════════════════════
   PRODUITS FRAIS — Chronopost Chrono 18 à domicile (migration 070)

   Commandes `delivery_mode = 'domicile_frais'`. Même API UGO que le
   point relais, avec trois différences relevées le 19/11/2026 sur un
   devis réel (multi-rate, rien de facturé) :
     · pas de `delivery_type` : c'est sans lui que UGO renvoie les offres
       à domicile (DELIVERY_TO_COLLECTION_POINT = relais seulement, et
       aucune autre valeur n'est acceptée) ;
     · l'offre retenue est « Chrono 18 Dropoff » (CHRONOPOST, code 16,
       allow_dropoff) : la boutique dépose le colis, livraison le
       lendemain avant 18 h. « Chrono 18 » tout court = enlèvement chez
       nous, ~2× plus cher : jamais choisi ici ;
     · pas de `dropoff_to` : l'adresse de livraison est ship_to.
   L'étiquette n'est PAS créée au paiement : elle se crée depuis l'admin
   le jour du dépôt, pour que la date d'envoi soit la vraie (un produit
   frais ne doit pas attendre un week-end en transit).
   ═══════════════════════════════════════════════════════════════ */

/** Poche isotherme + pain de glace, en plus de la tare habituelle. */
const TARE_FRAIS_G = Number(process.env.LOGSPHER_TARE_FRAIS_G) || 300;

export interface LogspherChronoLabelResult extends LogspherLabelResult {
  /** carrier_id UGO de Chronopost : sert au suivi (is-delivered). */
  carrier_uuid: string;
}

/** Offre Chrono 18 « dépôt » parmi celles de multi-rate, null sinon. */
export function offreChrono18Depot(offres: any[]): any | null {
  const liste = Array.isArray(offres) ? offres : [];
  const estChrono = (o: any) => String(o?.carrier_name || '').toUpperCase() === 'CHRONOPOST';
  return liste.find(o => estChrono(o) && String(o.service_code) === '16'
      && o.allow_dropoff === true && o.delivery_to_collection_point !== true)
    || liste.find(o => estChrono(o) && /chrono\s*18\s*drop/i.test(String(o.service_name || '')))
    || null;
}

/** « 12 rue X, Bât. B, 75011 Paris, FR » → champs d'adresse (ligne 2 séparée). */
export function adresseDomicile(brut: string) {
  const a = parseAddress(String(brut || '').replace(/^Point relais\b.*$/i, ''));
  const [ligne1, ...reste] = a.address1.split(',').map(s => s.trim()).filter(Boolean);
  return { address1: ligne1 || '', address2: reste.join(', '), postcode: a.postcode, city: a.city, country: a.country };
}

export async function createLogspherChronoFraisLabel(
  order: {
    order_number: string;
    customer_name: string;
    customer_email: string;
    customer_phone?: string;
    /** Adresse de livraison saisie chez Stripe (« ligne 1, ligne 2, CP Ville, FR »). */
    shipping_address: string;
    lines: Array<{ qty?: number; [key: string]: any }>;
    total: number;
    /** Poids réel pesé (g), saisi dans l'admin ; remplace l'estimation. */
    weight_grams?: number;
    /** order_id envoyé à UGO quand le numéro de commande est déjà consommé (voir referenceUgo). */
    ugo_reference?: string;
  },
  wlConfig: { address?: string; site_name?: string; email?: string; phone?: string },
): Promise<LogspherChronoLabelResult> {
  const dest = adresseDomicile(order.shipping_address);
  if (!dest.address1 || !dest.postcode || !dest.city) {
    throw new Error(`Adresse de livraison incomplète (« ${order.shipping_address || 'vide'} ») : corrige-la dans la commande avant de créer l'étiquette Chrono 18.`);
  }
  if (dest.country !== 'FR') {
    throw new Error(`Chrono 18 : livraison en France seulement (pays de l'adresse : ${dest.country}).`);
  }
  const phone = String(order.customer_phone || '').trim();
  if (!phone) throw new Error('Téléphone du client manquant : Chronopost en a besoin pour prévenir de la livraison.');

  const senderPhone = (wlConfig.phone || process.env.LOGSPHER_SENDER_PHONE || '').trim();
  if (!senderPhone) {
    throw new Error('Téléphone expéditeur manquant : renseigner le téléphone dans Admin › Marque blanche (ou LOGSPHER_SENDER_PHONE).');
  }

  const shipFrom = parseAddress(wlConfig.address || '');
  const nameParts = (order.customer_name || '').trim().split(/\s+/);
  const lastname = nameParts[0] || '';
  const firstname = nameParts.slice(1).join(' ') || lastname;
  const totalQty = (order.lines || []).reduce((acc, l) => acc + (l.qty || 1), 0);
  const weightGrams = order.weight_grams && order.weight_grams > 0
    ? Math.round(order.weight_grams)
    : (await poidsDuColis(order.lines || [])) + TARE_FRAIS_G;
  const weightKg = weightGrams / 1000;
  const parcels = [{ number: 1, weight: weightKg, volumetric_weight: weightKg, x: 30, y: 20, z: 20 }];
  const shipmentDate = new Date().toISOString().split('T')[0];

  // 1. Tarif : sans delivery_type → offres à domicile.
  const rateRes = await apiFetch('/api/carrier/multi-rate', {
    method: 'POST',
    body: JSON.stringify({
      order_id: order.ugo_reference || order.order_number,
      shipment: { id: 1, type: 2, shipment_date: shipmentDate },
      ship_from: { pro: true, country_code: shipFrom.country.slice(0, 2), postcode: shipFrom.postcode, city: shipFrom.city },
      ship_to: { pro: false, country_code: 'FR', postcode: dest.postcode, city: dest.city },
      parcels,
    }),
  });
  const offre = offreChrono18Depot(rateRes?.offers);
  if (!offre) {
    const vues = (rateRes?.offers || []).map((o: any) => `${o.carrier_name} ${o.service_name}`).join(', ') || 'aucune';
    throw new Error(`Pas d'offre Chronopost « Chrono 18 Dropoff » chez UGO pour ${dest.postcode} ${dest.city} (offres reçues : ${vues}).`);
  }

  // 2. Étiquette
  const shipRes = await apiFetch('/api/carrier/ship', {
    method: 'POST',
    body: JSON.stringify({
      order_id: order.ugo_reference || order.order_number,
      process_shipment: true,
      shipment: {
        id: 1,
        type: 2,
        shipment_date: shipmentDate,
        dropoff: true,
        content: 'Produits alimentaires suedois',
        reason: 'Commercial',
        insurance: false,
        service_id: offre.service_id,
        service_code: offre.service_code,
        label_format: 'PDF',
      },
      ship_from: {
        pro: true,
        country_code: shipFrom.country.slice(0, 2),
        postcode: shipFrom.postcode,
        city: shipFrom.city,
        address1: shipFrom.address1,
        company: wlConfig.site_name || '',
        lastname: wlConfig.site_name || '',
        email: wlConfig.email || '',
        phone: senderPhone,
      },
      // UGO exige ship_to.company non vide, même pour un particulier.
      ship_to: {
        pro: false,
        country_code: 'FR',
        postcode: dest.postcode,
        city: dest.city,
        address1: dest.address1,
        ...(dest.address2 ? { address2: dest.address2 } : {}),
        company: (order.customer_name || '').trim() || lastname,
        lastname,
        firstname,
        email: order.customer_email || '',
        phone,
      },
      parcels,
      products: [{
        number: totalQty,
        currency: 'EUR',
        value: order.total,
        value_eur: order.total,
        description: 'Produits alimentaires suedois',
        country_code: 'FR',
      }],
    }),
  });
  if (!shipRes.success) {
    throw new Error('Erreur création étiquette Chrono 18 : ' + JSON.stringify(shipRes.errors || {}));
  }

  return {
    shipment_id: shipRes.shipment_id || 0,
    tracking_number: shipRes.tracking_numbers?.[0] || '',
    label_url: shipRes.waybills_uri?.[0] || shipRes.waybills?.[0] || '',
    carrier_name: shipRes.carrier_name || offre.carrier_name || 'CHRONOPOST',
    carrier_code: shipRes.carrier_code || offre.service_code || '',
    carrier_uuid: offre.carrier_id || '',
  };
}
