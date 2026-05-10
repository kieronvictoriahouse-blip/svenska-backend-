import { NextRequest, NextResponse } from 'next/server';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(req: NextRequest) {
  const from = req.nextUrl.searchParams.get('from') || 'SEK';
  const to   = req.nextUrl.searchParams.get('to')   || 'EUR';
  const date = req.nextUrl.searchParams.get('date') || 'latest';

  try {
    const res = await fetch(`https://api.frankfurter.app/${date}?from=${from}&to=${to}`, {
      next: { revalidate: 3600 }, // cache 1h
    });
    if (!res.ok) throw new Error(`Frankfurter HTTP ${res.status}`);
    const data = await res.json();
    const rate = data.rates?.[to];
    if (!rate) throw new Error('Taux introuvable');
    return NextResponse.json({ rate, from, to, date: data.date }, { headers: CORS });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur inconnue' }, { status: 500, headers: CORS });
  }
}
