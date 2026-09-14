import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

/* ═══════════════════════════════════════════════════════════════
   AVIS PRODUITS — route publique (lecture et dépôt)

   GET  ?product_id=…  → les avis publiés d'un produit
   POST { order_id, product_id, rating, comment, name }
                       → dépose un avis VÉRIFIÉ

   Un avis n'est accepté que si la commande citée existe, qu'elle est
   payée, et qu'elle contenait bien ce produit. Sans cette règle, le
   formulaire serait une boîte à faux avis — et Google retire les
   étoiles des sites qui en affichent.

   Le nom affiché est tronqué au prénom + initiale (« Camille C. ») :
   un avis public ne doit pas exposer l'identité complète d'un client.
   ═══════════════════════════════════════════════════════════════ */

const PAYEES = ['paid', 'confirmed', 'preparing', 'partial', 'shipped', 'delivered'];

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

/** « Camille Chastagnier » → « Camille C. » */
function nomPublic(nom: string | null | undefined): string {
  const parts = String(nom || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Client vérifié';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

export async function GET(req: NextRequest) {
  const productId = req.nextUrl.searchParams.get('product_id');
  if (!productId) {
    return NextResponse.json({ error: 'product_id requis' }, { status: 400, headers: CORS });
  }

  const { data, error } = await supabaseAdmin
    .from('product_reviews')
    .select('id,rating,comment,customer_name,created_at')
    .eq('product_id', productId)
    .eq('is_published', true)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: 'lecture impossible' }, { status: 500, headers: CORS });
  }

  const avis = (data || []).map(a => ({
    id: a.id,
    rating: a.rating,
    comment: a.comment,
    author: nomPublic(a.customer_name),
    date: a.created_at,
  }));
  const moyenne = avis.length
    ? Math.round((avis.reduce((s, a) => s + a.rating, 0) / avis.length) * 10) / 10
    : 0;

  return NextResponse.json({ reviews: avis, count: avis.length, rating: moyenne }, { headers: CORS });
}

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { body = null; }
  if (!body) return NextResponse.json({ error: 'Requête invalide' }, { status: 400, headers: CORS });

  const { order_id, product_id, rating, comment } = body;
  const note = parseInt(rating, 10);

  if (!order_id || !product_id) {
    return NextResponse.json({ error: 'Commande ou produit manquant' }, { status: 400, headers: CORS });
  }
  if (!(note >= 1 && note <= 5)) {
    return NextResponse.json({ error: 'La note doit être comprise entre 1 et 5.' }, { status: 400, headers: CORS });
  }

  /* ── Vérification : la commande existe, elle est payée, et ce
     produit y figure bien. C'est ce qui rend l'avis « vérifié ». ── */
  const { data: commande } = await supabaseAdmin
    .from('orders')
    .select('id,status,lines,customer_name,customer_email')
    .eq('id', order_id)
    .maybeSingle();

  if (!commande || !PAYEES.includes(commande.status)) {
    return NextResponse.json(
      { error: 'Cette commande est introuvable — le lien a peut-être expiré.' },
      { status: 403, headers: CORS });
  }

  let lignes: any[] = [];
  try {
    lignes = typeof commande.lines === 'string' ? JSON.parse(commande.lines) : (commande.lines || []);
  } catch { lignes = []; }

  const contient = lignes.some((l: any) => String(l.id || l.product_id || '') === String(product_id));
  if (!contient) {
    return NextResponse.json(
      { error: 'Ce produit ne figure pas dans cette commande.' },
      { status: 403, headers: CORS });
  }

  const texte = String(comment || '').trim().slice(0, 1500) || null;

  /* Un seul avis par produit et par commande : un second envoi
     remplace le premier plutôt que d'échouer — le client qui corrige
     sa note ne doit pas se heurter à un mur. */
  const { error } = await supabaseAdmin
    .from('product_reviews')
    .upsert({
      product_id,
      order_id,
      rating: note,
      comment: texte,
      customer_name: commande.customer_name || null,
      customer_email: commande.customer_email || null,
      lang: String(body.lang || 'fr').slice(0, 5),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'product_id,order_id' });

  if (error) {
    return NextResponse.json({ error: 'Enregistrement impossible.' }, { status: 500, headers: CORS });
  }

  return NextResponse.json({ ok: true }, { headers: CORS });
}
