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

const API_URL = process.env.LOGSPHER_API_URL || 'https://upelgo.com';

// UUIDs des carriers qui supportent les points relais (dropoff-locations)
// Chronopost BtoC (Chrono Relais) + Chronopost 2Shop
const RELAY_CARRIER_UUIDS = (process.env.LOGSPHER_RELAY_CARRIER_UUIDS || '8c242fd4-bd1a-4fb9-8188-5586b3f1e807,a0ad7a57-f1f2-4c89-9d1c-7c94ab4a7933')
  .split(',').map(s => s.trim()).filter(Boolean);

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
  if (!res.ok) throw new Error(`LogSpher ${path} → ${res.status}: ${text?.slice(0, 200)}`);
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

  const results = await Promise.allSettled(
    RELAY_CARRIER_UUIDS.map(async (uuid) => {
      const data = await lsFetch(`/api/carrier/${uuid}/dropoff-locations`, {
        method: 'POST',
        body: JSON.stringify({
          address:      city || cp,
          city:         city || '',
          postcode:     cp,
          country_code: country,
        }),
      });
      return { uuid, locations: data.locations || [] };
    })
  );

  const points: any[] = [];
  const carrierNames: Record<string, string> = {
    '8c242fd4-bd1a-4fb9-8188-5586b3f1e807': 'Chronopost Relais',
    'a0ad7a57-f1f2-4c89-9d1c-7c94ab4a7933': 'Chronopost 2Shop',
  };

  for (const r of results) {
    if (r.status === 'rejected') {
      console.warn('[relay-points] carrier failed:', r.reason?.message);
      continue;
    }
    const { uuid, locations } = r.value;
    for (const loc of locations) {
      const rawDist = Number(loc.distance || 0);
      points.push({
        id:           String(loc.location_id || loc.dropoff_location_id || ''),
        name:         loc.name || '',
        adresse:      loc.address1 || '',
        ville:        loc.city || '',
        cp:           loc.postcode || '',
        pays:         loc.country_code || country,
        carrier_name: carrierNames[uuid] || 'Chronopost',
        carrier_uuid: uuid,
        distance:     rawDist ? String(Math.round(rawDist * 10) / 10) : undefined,
        hours:        loc.hours_formatted || undefined,
      });
    }
  }

  return NextResponse.json({ points }, { headers: CORS });
}
