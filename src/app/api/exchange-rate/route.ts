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
  const from = (req.nextUrl.searchParams.get('from') || 'SEK').toUpperCase();
  const to   = (req.nextUrl.searchParams.get('to')   || 'EUR').toUpperCase();
  const date = req.nextUrl.searchParams.get('date') || 'latest';
  /* Route publique : les paramètres partaient tels quels dans le chemin de
     l'API Frankfurter (« date=../… »). Devise = 3 lettres, date = AAAA-MM-JJ. */
  if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to) || !(date === 'latest' || /^\d{4}-\d{2}-\d{2}$/.test(date))) {
    return NextResponse.json({ error: 'Paramètres invalides' }, { status: 400, headers: CORS });
  }

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
