import { NextRequest, NextResponse } from 'next/server';
import { boutiqueDeRequete } from '@/lib/boutique';
import { inscrireNewsletter } from '@/lib/newsletter-inscrire';

// Inscription newsletter — PUBLIC (pas d'auth). Enregistre l'email dans le CRM (contacts)
// pour qu'il soit exploitable par le module Marketing (campagnes).
//
// Un abonné = un contact portant l'étiquette « newsletter » (les plus anciens
// portent seulement company = 'Inscrit newsletter' ; les deux sont reconnus
// par l'envoi de campagne, cf. /api/email).
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

/* Garde-fou anti-rafale, par instance (même principe que /api/contact) :
   sans lui, un robot pouvait remplir la liste d'adresses de tiers, qui
   auraient ensuite reçu les campagnes sans jamais s'être inscrites. */
const recents = new Map<string, number[]>();
function tropDInscriptions(ip: string): boolean {
  const now = Date.now();
  const liste = (recents.get(ip) || []).filter(t => now - t < 10 * 60_000);
  liste.push(now);
  recents.set(ip, liste);
  return liste.length > 5;
}

export async function POST(req: NextRequest) {
  let body: any = {};
  try { body = await req.json(); } catch { /* ignore */ }

  // Piège à robots : champ invisible rempli → on fait semblant d'accepter.
  if (typeof body.website === 'string' && body.website.trim()) {
    return NextResponse.json({ ok: true }, { headers: CORS });
  }

  const email = String(body.email || '').trim().toLowerCase();
  const emailOk = email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
  if (!emailOk) {
    return NextResponse.json({ error: 'Email invalide' }, { status: 400, headers: CORS });
  }

  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'inconnu';
  if (tropDInscriptions(ip)) {
    return NextResponse.json({ error: 'Trop de tentatives, réessayez plus tard' }, { status: 429, headers: CORS });
  }

  /* Langue du site au moment de l'inscription : la newsletter part dans
     cette langue. Logique d'inscription partagée avec le paiement (case
     « nouveautés » du panier) : lib/newsletter-inscrire. */
  const r = await inscrireNewsletter(email, { lang: body.lang, boutique: boutiqueDeRequete(req) });
  if (!r.ok) {
    console.error('[newsletter] inscription impossible :', r.error);
    return NextResponse.json({ error: 'Inscription impossible' }, { status: 500, headers: CORS });
  }
  return NextResponse.json(r.already ? { ok: true, already: true } : { ok: true }, { headers: CORS });
}
