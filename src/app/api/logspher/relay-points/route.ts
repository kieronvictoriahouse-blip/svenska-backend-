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
    // 1. Récupérer tous les transporteurs actifs
    const carriers: Array<{ uuid: string; name: string; carrierName?: string }> =
      await logspherFetch('/api/configuration/carrier/uuid/available');

    console.log('[logspher/relay-points] carriers:', JSON.stringify(carriers));

    if (!Array.isArray(carriers) || carriers.length === 0) {
      return NextResponse.json({ points: [], debug: 'no carriers' }, { headers: CORS });
    }

    // 2. Essayer tous les transporteurs actifs (certains ne supportent pas dropoff, on ignore les erreurs)
    const results = await Promise.allSettled(
      carriers.map(async (carrier) => {
        const body = {
          address:      cp || city, // address est requis dans l'API
          city:         city || '',
          postcode:     cp,
          country_code: country,
        };
        const data = await logspherFetch(`/api/carrier/${carrier.uuid}/dropoff-locations`, {
          method: 'POST',
          body: JSON.stringify(body),
        });
        return { carrier, locations: data.locations || [] };
      })
    );

    // Log des erreurs par carrier pour debug
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        console.log(`[logspher/relay-points] carrier ${carriers[i]?.name} (${carriers[i]?.uuid}) failed:`, r.reason?.message);
      } else {
        console.log(`[logspher/relay-points] carrier ${carriers[i]?.name} → ${r.value.locations.length} points`);
      }
    });

    // 3. Normaliser et fusionner les points
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
        const rawDist = loc.distance;
        // LogSpher renvoie la distance en mètres → convertir en km
        const distKm = rawDist
          ? String(Math.round(Number(rawDist) / 1000 * 10) / 10)
          : undefined;
        points.push({
          id:           String(loc.id || loc.dropoff_location_id || ''),
          name:         loc.name || loc.company || '',
          adresse:      loc.address1 || loc.address || '',
          ville:        loc.city || '',
          cp:           loc.postcode || loc.postal_code || '',
          pays:         loc.country_code || country,
          carrier_name: carrier.name || '',
          carrier_uuid: carrier.uuid,
          distance:     distKm,
        });
      }
    }

    return NextResponse.json({ points }, { headers: CORS });
  } catch (err: any) {
    console.error('[logspher/relay-points]', err.message);
    return NextResponse.json({ error: err.message, points: [] }, { status: 500, headers: CORS });
  }
}
