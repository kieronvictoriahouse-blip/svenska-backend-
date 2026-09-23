import { supabaseAdmin } from '@/lib/supabase';

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
const TARE_EMBALLAGE_G = 200;   // carton + calage
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
  // Arrondi aux 100 g superieurs, plancher a 300 g.
  return Math.max(300, Math.ceil(avecTare / 100) * 100);
}

/** Annule l'étiquette UGO d'une commande (passage en Click & Collect,
    commande annulée). UGO l'identifie par l'order_id envoyé à /ship,
    c'est-à-dire notre numéro de commande. */
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
  },
  wlConfig: {
    address?: string;
    site_name?: string;
    email?: string;
    phone?: string;
  }
): Promise<LogspherLabelResult> {
  const shipFrom = parseAddress(wlConfig.address || '');

  // Adresse du client = adresse du point relais (c'est là que la livraison va)
  const relayAddress = order.relay_point_address
    ? parseAddress(order.relay_point_address)
    : { address1: '', postcode: '', city: '', country: order.relay_point_pays || 'FR' };

  const nameParts = (order.customer_name || '').trim().split(/\s+/);
  const lastname = nameParts[0] || '';
  const firstname = nameParts.slice(1).join(' ') || lastname;

  const totalQty = (order.lines || []).reduce((acc, l) => acc + (l.qty || 1), 0);
  const weightGrams = await poidsDuColis(order.lines || []);

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
    order_id: order.order_number,
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
      order_id: order.order_number,
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
          value:       order.total,
          value_eur:   order.total,
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
