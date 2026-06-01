import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const API_URL = process.env.LOGSPHER_API_URL || 'https://upelgo.com';

function getApiKey() {
  return process.env.LOGSPHER_API_KEY || '';
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
  let json: any = null;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, ok: res.ok, body: json };
}

export async function GET(req: NextRequest) {
  if (!await requireAuth(req)) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const cp      = searchParams.get('cp') || '75001';
  const country = searchParams.get('country') || 'FR';

  // 1. Liste des carriers
  const carriersRes = await lsFetch('/api/configuration/carrier/uuid/available');

  if (!carriersRes.ok || !Array.isArray(carriersRes.body)) {
    return NextResponse.json({ step: 'carriers', error: carriersRes });
  }

  const carriers = carriersRes.body;

  // 2. Dropoff-locations pour chaque carrier
  const dropoffResults = await Promise.all(
    carriers.map(async (c: any) => {
      const res = await lsFetch(`/api/carrier/${c.uuid}/dropoff-locations`, {
        method: 'POST',
        body: JSON.stringify({
          address:      cp,
          city:         '',
          postcode:     cp,
          country_code: country,
        }),
      });
      return {
        carrier_uuid: c.uuid,
        carrier_name: c.name,
        status:       res.status,
        ok:           res.ok,
        locations_count: Array.isArray(res.body?.locations) ? res.body.locations.length : 'N/A',
        sample:       res.ok ? (res.body?.locations || []).slice(0, 2) : res.body,
      };
    })
  );

  return NextResponse.json({ carriers, dropoffResults });
}
