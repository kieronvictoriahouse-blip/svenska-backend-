import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/* ═══════════════════════════════════════════════════════════════
   ALERTE « RETOUR EN STOCK » — PUBLIC (pas d'auth)

   La fiche d'un produit épuisé propose « Prévenez-moi de son retour ».
   On enregistre l'adresse pour CE produit ; le cron quotidien envoie un
   seul e-mail quand il redevient disponible (lib/alertes-stock).
   ═══════════════════════════════════════════════════════════════ */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

/* Garde-fou anti-rafale, par instance (même principe que /api/newsletter) :
   un robot ne doit pas pouvoir inscrire en masse des adresses de tiers. */
const recents = new Map<string, number[]>();
function tropDeDemandes(ip: string): boolean {
  const now = Date.now();
  const liste = (recents.get(ip) || []).filter(t => now - t < 10 * 60_000);
  liste.push(now);
  recents.set(ip, liste);
  return liste.length > 8;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  let body: any = {};
  try { body = await req.json(); } catch { /* ignore */ }

  // Piège à robots : champ invisible rempli → on fait semblant d'accepter.
  if (typeof body.website === 'string' && body.website.trim()) {
    return NextResponse.json({ ok: true }, { headers: CORS });
  }

  const email = String(body.email || '').trim().toLowerCase();
  if (!(email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))) {
    return NextResponse.json({ error: 'Email invalide' }, { status: 400, headers: CORS });
  }
  const productId = String(body.product_id || '');
  if (!UUID.test(productId)) {
    return NextResponse.json({ error: 'Produit inconnu' }, { status: 400, headers: CORS });
  }
  const lang = ['fr', 'en', 'sv'].includes(body.lang) ? body.lang : 'fr';

  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'inconnu';
  if (tropDeDemandes(ip)) {
    return NextResponse.json({ error: 'Trop de tentatives, réessayez plus tard' }, { status: 429, headers: CORS });
  }

  const { data: produit } = await supabaseAdmin
    .from('products').select('id').eq('id', productId).eq('is_active', true).maybeSingle();
  if (!produit) {
    return NextResponse.json({ error: 'Produit inconnu' }, { status: 404, headers: CORS });
  }

  const { error } = await supabaseAdmin.from('stock_alerts').insert({ product_id: productId, email, lang });
  /* Déjà inscrit pour ce produit (index unique sur les alertes en attente) :
     même réponse, on ne révèle pas qu'une adresse est connue. */
  if (error && error.code !== '23505') {
    console.error('[stock-alerts] enregistrement impossible :', error.message);
    return NextResponse.json({ error: 'Enregistrement impossible' }, { status: 500, headers: CORS });
  }
  return NextResponse.json({ ok: true }, { headers: CORS });
}
