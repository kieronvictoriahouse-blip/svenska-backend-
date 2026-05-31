import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

function getApiKey() {
  const key = process.env.LOGSPHER_API_KEY;
  if (!key) throw new Error('LOGSPHER_API_KEY manquante');
  return key;
}

const API_URL = process.env.LOGSPHER_API_URL || 'https://cloud.upelgo.com';

async function logspherFetch(path: string, options: RequestInit = {}) {
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

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const cp      = searchParams.get('cp') || '';
  const city    = searchParams.get('city') || '';
  const country = (searchParams.get('country') || 'FR').toUpperCase();

  if (!cp && !city) {
    return NextResponse.json({ error: 'cp ou city requis' }, { status: 400, headers: CORS });
  }

  try {
    // 1. Récupérer les transporteurs actifs
    const carriers: Array<{ uuid: string; name: string; carrierName?: string }> =
      await logspherFetch('/api/configuration/carrier/uuid/available');

    if (!Array.isArray(carriers) || carriers.length === 0) {
      return NextResponse.json({ points: [] }, { headers: CORS });
    }

    // 2. Filtrer les transporteurs shop-to-shop / point relais
    const shop2shopCarriers = carriers.filter(c => {
      const n = (c.name || c.carrierName || '').toLowerCase();
      return n.includes('2shop') || n.includes('shop2shop') || n.includes('relay') || n.includes('relais') || n.includes('mondial');
    });

    // Si aucun carrier shop2shop trouvé, essayer tous
    const targets = shop2shopCarriers.length > 0 ? shop2shopCarriers : carriers;

    // 3. Appeler dropoff-locations pour chaque transporteur en parallèle
    const results = await Promise.allSettled(
      targets.map(async (carrier) => {
        const data = await logspherFetch(`/api/carrier/${carrier.uuid}/dropoff-locations`, {
          method: 'POST',
          body: JSON.stringify({
            address: '',
            city: city || '',
            postcode: cp,
            country_code: country,
          }),
        });
        return { carrier, locations: data.locations || [] };
      })
    );

    // 4. Normaliser et fusionner les points
    const points: Array<{
      id: string;
      name: string;
      adresse: string;
      ville: string;
      cp: string;
      pays: string;
      carrier_name: string;
      carrier_uuid: string;
      distance?: string;
    }> = [];

    for (const r of results) {
      if (r.status === 'rejected') continue;
      const { carrier, locations } = r.value;
      for (const loc of locations) {
        points.push({
          id:           loc.id || loc.dropoff_location_id || '',
          name:         loc.name || loc.company || '',
          adresse:      loc.address1 || loc.address || '',
          ville:        loc.city || '',
          cp:           loc.postcode || loc.postal_code || '',
          pays:         loc.country_code || country,
          carrier_name: carrier.name || '',
          carrier_uuid: carrier.uuid,
          distance:     loc.distance ? String(Math.round(Number(loc.distance) / 1000 * 10) / 10) : undefined,
        });
      }
    }

    return NextResponse.json({ points }, { headers: CORS });
  } catch (err: any) {
    console.error('[logspher/relay-points]', err.message);
    return NextResponse.json({ error: err.message, points: [] }, { status: 500, headers: CORS });
  }
}
