import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

const API_URL = process.env.LOGSPHER_API_URL || 'https://cloud.upelgo.com';

function getApiKey() {
  const key = process.env.LOGSPHER_API_KEY;
  if (!key) throw new Error('LOGSPHER_API_KEY manquante');
  return key;
}

async function lsFetch(path: string, options: RequestInit = {}) {
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

function parseAddress(full: string) {
  const parts = (full || '').split(',').map(p => p.trim()).filter(Boolean);
  let country = 'FR', rest = parts;
  const last = parts[parts.length - 1] || '';
  if (/^[A-Z]{2}$/.test(last)) { country = last; rest = parts.slice(0, -1); }
  let postcode = '', city = '', address1Parts: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const m = rest[i].match(/^(\d{4,5})\s+(.+)$/);
    if (m) { postcode = m[1]; city = m[2]; address1Parts = rest.slice(0, i); break; }
    address1Parts.push(rest[i]);
  }
  if (!postcode) {
    const m = (rest[rest.length - 1] || '').match(/(\d{4,5})\s+(.+)/);
    if (m) { postcode = m[1]; city = m[2]; address1Parts = rest.slice(0, -1); }
  }
  return { address1: address1Parts.join(', ') || rest[0] || '', postcode, city, country };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const cp      = searchParams.get('cp') || '';
  const city    = searchParams.get('city') || '';
  const country = (searchParams.get('country') || 'FR').toUpperCase();

  if (!cp && !city) {
    return NextResponse.json({ error: 'cp ou city requis' }, { status: 400, headers: CORS });
  }

  try {
    // 1. Récupérer l'adresse d'expédition depuis la config
    const { data: cfg } = await supabaseAdmin
      .from('white_label_config').select('address,site_name,email,phone').single();
    const shipFrom = parseAddress(cfg?.address || '');

    const today = new Date().toISOString().split('T')[0];

    // 2. Multi-rate pour trouver le carrier le moins cher en point relais
    const ratePayload = {
      order_id: `relay-search-${cp}-${country}`,
      shipment: {
        type: 1,
        shipment_date: today,
        delivery_type: 'PICKUP_POINT',
        dropoff: true,
        content: 'Produits alimentaires',
        insurance: false,
      },
      ship_from: {
        pro: true,
        country_code: shipFrom.country.slice(0, 2),
        postcode: shipFrom.postcode,
        city: shipFrom.city,
        address1: shipFrom.address1,
        company: cfg?.site_name || 'Svenska Delikatessen',
        lastname: cfg?.site_name || 'Svenska Delikatessen',
        email: cfg?.email || '',
        phone: cfg?.phone || '',
      },
      ship_to: {
        pro: false,
        country_code: country.slice(0, 2),
        postcode: cp,
        city: city || cp,
        lastname: 'Client',
      },
      parcels: [{ weight: 500, length: 20, width: 15, height: 10 }],
    };

    console.log('[relay-points] multi-rate payload:', JSON.stringify(ratePayload));

    const rateRes = await lsFetch('/api/carrier/multi-rate', {
      method: 'POST',
      body: JSON.stringify(ratePayload),
    });

    console.log('[relay-points] multi-rate response:', JSON.stringify(rateRes));

    if (!rateRes.success || !Array.isArray(rateRes.offers) || rateRes.offers.length === 0) {
      return NextResponse.json({ points: [], debug: 'no_offers', errors: rateRes.errors }, { headers: CORS });
    }

    // 3. Prendre le carrier le moins cher
    const offers = [...rateRes.offers].sort((a: any, b: any) => (a.price_te ?? 0) - (b.price_te ?? 0));
    const best = offers[0];
    const carrierUuid = best.carrier_id || best.carrier_uuid || best.uuid || '';
    const carrierName = best.carrier_name || best.name || '';
    const priceTE     = best.price_te ?? null;

    console.log('[relay-points] best offer:', JSON.stringify(best));

    if (!carrierUuid) {
      // Fallback : récupérer l'UUID depuis la liste des carriers actifs
      const carriers = await lsFetch('/api/configuration/carrier/uuid/available');
      const match = Array.isArray(carriers)
        ? carriers.find((c: any) => (c.name || '').toLowerCase() === carrierName.toLowerCase())
        : null;
      if (!match) {
        return NextResponse.json({ points: [], debug: 'no_carrier_uuid', best }, { headers: CORS });
      }
      best._resolved_uuid = match.uuid;
    }

    const uuid = carrierUuid || best._resolved_uuid;

    // 4. Récupérer les points relais du carrier le moins cher
    const dropoffRes = await lsFetch(`/api/carrier/${uuid}/dropoff-locations`, {
      method: 'POST',
      body: JSON.stringify({
        address:      cp,
        city:         city || '',
        postcode:     cp,
        country_code: country,
      }),
    });

    console.log('[relay-points] dropoff count:', dropoffRes.locations?.length);

    const points = (dropoffRes.locations || []).map((loc: any) => {
      const rawDist = Number(loc.distance || 0);
      return {
        id:           String(loc.id || loc.dropoff_location_id || ''),
        name:         loc.name || loc.company || '',
        adresse:      loc.address1 || loc.address || '',
        ville:        loc.city || '',
        cp:           loc.postcode || loc.postal_code || '',
        pays:         loc.country_code || country,
        carrier_name: carrierName,
        carrier_uuid: uuid,
        price_te:     priceTE,
        distance:     rawDist ? String(Math.round(rawDist / 1000 * 10) / 10) : undefined,
      };
    });

    return NextResponse.json({ points, carrier_name: carrierName, price_te: priceTE }, { headers: CORS });
  } catch (err: any) {
    console.error('[relay-points]', err.message);
    return NextResponse.json({ error: err.message, points: [] }, { status: 500, headers: CORS });
  }
}
