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

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const cp      = searchParams.get('cp') || '';
  const city    = searchParams.get('city') || '';
  const country = (searchParams.get('country') || 'FR').toUpperCase();

  if (!cp && !city) {
    return NextResponse.json({ error: 'cp ou city requis' }, { status: 400, headers: CORS });
  }

  try {
    // 1. Récupérer tous les transporteurs actifs
    const carriers: Array<{ uuid: string; name: string; carrierName?: string }> =
      await lsFetch('/api/configuration/carrier/uuid/available');

    if (!Array.isArray(carriers) || carriers.length === 0) {
      return NextResponse.json({ points: [] }, { headers: CORS });
    }

    // 2. Appeler dropoff-locations pour chaque carrier en parallèle
    //    Les carriers qui ne supportent pas le dropoff échouent silencieusement
    const results = await Promise.allSettled(
      carriers.map(async (carrier) => {
        const data = await lsFetch(`/api/carrier/${carrier.uuid}/dropoff-locations`, {
          method: 'POST',
          body: JSON.stringify({
            address:      cp,
            city:         city || '',
            postcode:     cp,
            country_code: country,
          }),
        });
        return { carrier, locations: data.locations || [] };
      })
    );

    // 3. Normaliser et fusionner
    const points: any[] = [];
    for (const r of results) {
      if (r.status === 'rejected') continue;
      const { carrier, locations } = r.value;
      if (!locations.length) continue;
      for (const loc of locations) {
        const rawDist = Number(loc.distance || 0);
        points.push({
          id:           String(loc.id || loc.dropoff_location_id || ''),
          name:         loc.name || loc.company || '',
          adresse:      loc.address1 || loc.address || '',
          ville:        loc.city || '',
          cp:           loc.postcode || loc.postal_code || '',
          pays:         loc.country_code || country,
          carrier_name: carrier.name || '',
          carrier_uuid: carrier.uuid,
          distance:     rawDist ? String(Math.round(rawDist / 1000 * 10) / 10) : undefined,
        });
      }
    }

    return NextResponse.json({ points }, { headers: CORS });
  } catch (err: any) {
    console.error('[logspher/relay-points]', err.message);
    return NextResponse.json({ error: err.message, points: [] }, { status: 500, headers: CORS });
  }
}
