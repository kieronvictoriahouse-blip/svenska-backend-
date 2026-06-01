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
  const weightGrams = Math.max(500, totalQty * 500);

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

  const baseShipFrom = {
    pro: true,
    country_code: shipFrom.country.slice(0, 2),
    postcode: shipFrom.postcode,
    city: shipFrom.city,
    address1: shipFrom.address1,
    company: wlConfig.site_name || 'Svenska Delikatessen',
    lastname: wlConfig.site_name || 'Svenska Delikatessen',
    email: wlConfig.email || '',
    phone: wlConfig.phone || '',
  };

  // ship_to = adresse du client (pour l'identification)
  const baseShipTo = {
    pro: false,
    country_code: destCountry,
    postcode: relayAddress.postcode,
    city: relayAddress.city,
    address1: relayAddress.address1,
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

  // Step 1: obtenir le tarif — via le carrier UUID du point relais choisi si disponible, sinon multi-rate
  let best: any;
  if (order.relay_carrier_uuid) {
    // Le client a choisi un point relais d'un carrier spécifique → on utilise ce carrier directement
    const rateRes = await apiFetch(`/api/carrier/${order.relay_carrier_uuid}/rate`, {
      method: 'POST',
      body: JSON.stringify({
        order_id: order.order_number,
        shipment: baseShipment,
        ship_from: baseShipFrom,
        ship_to: baseShipTo,
        parcels: baseParcels,
      }),
    });
    if (!rateRes.success || !Array.isArray(rateRes.offers) || !rateRes.offers.length) {
      throw new Error('Aucune offre pour ce carrier: ' + JSON.stringify(rateRes.errors || {}));
    }
    best = rateRes.offers[0];
  } else {
    // Fallback multi-rate → moins cher
    const rateRes = await apiFetch('/api/carrier/multi-rate', {
      method: 'POST',
      body: JSON.stringify({
        order_id: order.order_number,
        shipment: baseShipment,
        ship_from: baseShipFrom,
        ship_to: baseShipTo,
        parcels: baseParcels,
      }),
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
