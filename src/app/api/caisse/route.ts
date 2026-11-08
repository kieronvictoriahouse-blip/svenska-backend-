import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';
import { sortirColis, duParProduit } from '@/lib/expedition';
import { createInvoiceFromOrder, dateParis } from '@/lib/invoice-utils';

export const dynamic = 'force-dynamic';

/* ═══════════════════════════════════════════════════════════════
   CAISSE — vente en direct (marché, salon)  ·  /admin/caisse

   Une vente de caisse est une commande comme les autres : elle a son
   numéro SD-, sa facture, et elle compte dans le chiffre d'affaires
   (URSSAF, comptabilité) sans traitement à part. Ce qui la distingue :
   la marchandise part tout de suite, dans le sac du client. Elle est
   donc remise (statut « delivered ») au moment même où elle est payée,
   et sort du stock par le même chemin qu'un colis (sortirColis).

   Deux encaissements :
   · carte — la vendeuse encaisse dans l'application Stripe (Tap to Pay)
     puis valide ici : la vente est enregistrée payée et remise d'un coup ;
   · qr    — une session Stripe Checkout est créée pour le montant exact,
     le client la paie sur son téléphone. Elle porte metadata.order_id :
     le webhook la traite comme une commande en ligne (paiement, facture,
     reçu par e-mail au client). La caisse interroge ensuite la commande
     et la remet dès qu'elle est payée.

   Le repère des ventes de caisse est le préfixe « [CAISSE] » des notes
   (aucune migration) : le récapitulatif du jour le lit.
   ═══════════════════════════════════════════════════════════════ */

const REPERE = '[CAISSE]';
const r2 = (v: number) => Math.round(v * 100) / 100;

function stripeDe(test: boolean) {
  const cle = test ? (process.env.STRIPE_SECRET_KEY_TEST || '') : (process.env.STRIPE_SECRET_KEY || '');
  if (!cle) throw new Error(test ? 'Clé Stripe de test absente' : 'Clé Stripe absente');
  return new Stripe(cle, { apiVersion: '2026-04-22.dahlia' });
}

/** Remise de la marchandise : la commande payée passe « delivered » et
 *  le stock sort. Réclamée d'abord (statut conditionnel) : deux appels
 *  croisés — double clic, deux onglets, sondage du QR — ne sortent le
 *  stock qu'une fois. */
async function remettre(orderId: string) {
  const { data: order } = await supabaseAdmin.from('orders').select('*').eq('id', orderId).maybeSingle();
  if (!order) return { ok: false, erreur: 'Vente introuvable' };
  if (order.status === 'delivered') return { ok: true, order, deja: true };
  if (!['paid', 'confirmed'].includes(order.status)) return { ok: false, erreur: `Statut ${order.status}`, order };

  const colis = duParProduit(order.lines);
  const { data: pris } = await supabaseAdmin.from('orders').update({
    status: 'delivered',
    shipped_qty: colis,
    last_shipment: colis,
    picked_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', order.id).eq('status', order.status).select('*');
  if (!pris?.length) return { ok: true, order, deja: true };

  /* Une vente d'essai (mode test) ne touche pas au stock. */
  if (order.is_test) return { ok: true, order: pris[0], echecs: [] };
  const { echecs } = await sortirColis(order, colis);
  return { ok: true, order: pris[0], echecs };
}

export async function GET(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const u = new URL(req.url).searchParams;

  /* Recherche par nom ou référence, pour un article sans code-barres. */
  const q = (u.get('q') || '').trim();
  if (q) {
    const motif = `%${q.replace(/[%_,()]/g, ' ')}%`;
    const { data } = await supabaseAdmin.from('products')
      .select('id, name_fr, name_sv, price, stock, track_stock, image_url, ean, sku')
      .eq('is_active', true)
      .or(`name_fr.ilike.${motif},name_sv.ilike.${motif},sku.ilike.${motif}`)
      .order('name_fr').limit(12);
    return NextResponse.json({ produits: data || [] });
  }

  /* Tuiles « sans code-barres ». La caisse peut épingler ses propres
     articles (ids=…, gardés dans le navigateur) ; sinon, par défaut, les
     articles actifs qui n'ont pas d'EAN — ceux qu'on ne peut pas scanner —
     les box en tête. */
  if (u.has('tuiles')) {
    const champs = 'id, name_fr, price, stock, track_stock, image_url, bundle_items';
    const ids = (u.get('ids') || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 12);
    if (ids.length) {
      const { data } = await supabaseAdmin.from('products').select(champs).in('id', ids).eq('is_active', true);
      const rang = new Map(ids.map((id, i) => [id, i]));
      return NextResponse.json({ produits: (data || []).sort((a, b) => (rang.get(a.id) ?? 0) - (rang.get(b.id) ?? 0)) });
    }
    const { data } = await supabaseAdmin.from('products').select(champs)
      .eq('is_active', true).or('ean.is.null,ean.eq.').order('name_fr').limit(40);
    const estBox = (p: any) => !!(p.bundle_items && JSON.stringify(p.bundle_items).length > 4);
    const tri = (data || []).sort((a, b) => Number(estBox(b)) - Number(estBox(a)));
    return NextResponse.json({ produits: tri.slice(0, 10) });
  }

  /* Suivi d'un paiement par QR : la caisse sonde la commande. Dès que le
     webhook l'a passée payée, on la remet (stock + statut). */
  const id = u.get('vente');
  if (id) {
    const { data: o } = await supabaseAdmin.from('orders').select('id, status, order_number, total').eq('id', id).maybeSingle();
    if (!o) return NextResponse.json({ error: 'Vente introuvable' }, { status: 404 });
    if (['paid', 'confirmed'].includes(o.status)) {
      const r = await remettre(o.id);
      return NextResponse.json({ statut: r.ok ? 'delivered' : o.status, order_number: o.order_number, echecs: r.echecs || [] });
    }
    return NextResponse.json({ statut: o.status, order_number: o.order_number });
  }

  /* Récapitulatif du jour (heure de Paris). */
  const jour = u.get('jour') || dateParis();
  const debut = new Date(`${jour}T00:00:00+01:00`);
  const fin = new Date(+debut + 26 * 3600 * 1000);
  const { data: ventes } = await supabaseAdmin.from('orders')
    .select('id, order_number, total, status, notes, created_at, lines, is_test')
    .like('notes', `${REPERE}%`)
    .gte('created_at', debut.toISOString()).lt('created_at', fin.toISOString())
    .order('created_at', { ascending: false });
  const dujour = (ventes || []).filter(v => dateParis(new Date(v.created_at)) === jour);
  const encaissees = dujour.filter(v => v.status === 'delivered' && !v.is_test);
  const par = (m: string) => r2(encaissees.filter(v => String(v.notes).includes(m)).reduce((s, v) => s + Number(v.total), 0));
  return NextResponse.json({
    jour,
    ventes: dujour.map(v => {
      let lignes: any[] = [];
      try { lignes = typeof v.lines === 'string' ? JSON.parse(v.lines) : (v.lines || []); } catch { /* ligne illisible */ }
      return {
        id: v.id, numero: v.order_number, total: Number(v.total), statut: v.status, notes: v.notes, heure: v.created_at, test: !!v.is_test,
        mode: String(v.notes).includes('QR') ? 'QR code' : 'Carte',
        lignes: lignes.map(l => ({ product_id: l.product_id, nom: l.name, qty: Number(l.qty) || 0, prix: Number(l.price) || 0, image: l.image_url || null })),
      };
    }),
    total: r2(encaissees.reduce((s, v) => s + Number(v.total), 0)),
    nb: encaissees.length,
    carte: par('Carte'),
    qr: par('QR'),
  });
}

export async function POST(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const b = await req.json().catch(() => ({} as any));

  /* Abandon d'un paiement par QR encore en attente. */
  if (b.annuler) {
    const { data: o } = await supabaseAdmin.from('orders').select('id, status, stripe_session_id, is_test').eq('id', b.annuler).maybeSingle();
    if (!o || o.status !== 'pending') return NextResponse.json({ ok: true, statut: o?.status || null });
    if (o.stripe_session_id) {
      try { await stripeDe(!!o.is_test).checkout.sessions.expire(o.stripe_session_id); } catch { /* déjà payée ou expirée */ }
    }
    /* Relecture : la session a pu être payée à la dernière seconde. */
    const { data: apres } = await supabaseAdmin.from('orders').update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', o.id).eq('status', 'pending').select('id');
    return NextResponse.json({ ok: true, statut: apres?.length ? 'cancelled' : 'paid' });
  }

  const mode: 'carte' | 'qr' = b.mode === 'qr' ? 'qr' : 'carte';
  const test = !!b.test;
  const entrees: Array<{ product_id: string; qty: number; price: number }> = Array.isArray(b.lignes) ? b.lignes : [];
  const lignesDemandees = entrees
    .map(l => ({ product_id: String(l.product_id || ''), qty: Math.trunc(Number(l.qty) || 0), price: Number(l.price) }))
    .filter(l => l.product_id && l.qty > 0 && l.price >= 0);
  if (!lignesDemandees.length) return NextResponse.json({ error: 'Panier vide' }, { status: 400 });

  /* Les articles viennent de la base : nom et photo font foi. Le prix
     unitaire, lui, peut avoir été ajusté à la caisse (geste commercial). */
  const ids = Array.from(new Set(lignesDemandees.map(l => l.product_id)));
  const { data: produits } = await supabaseAdmin.from('products')
    .select('id, name_fr, name_sv, name_en, image_url').in('id', ids);
  const P = Object.fromEntries((produits || []).map(p => [p.id, p]));
  const inconnus = ids.filter(id => !P[id]);
  if (inconnus.length) return NextResponse.json({ error: 'Article introuvable dans le catalogue' }, { status: 400 });

  const lignes = lignesDemandees.map(l => ({
    product_id: l.product_id, qty: l.qty, price: r2(l.price),
    name: P[l.product_id].name_fr, name_sv: P[l.product_id].name_sv, name_en: P[l.product_id].name_en,
    image_url: P[l.product_id].image_url,
  }));
  const sousTotal = r2(lignes.reduce((s, l) => s + l.qty * l.price, 0));
  const remise = Math.min(Math.max(0, r2(Number(b.remise) || 0)), sousTotal);
  const total = r2(sousTotal - remise);
  if (mode === 'qr' && total < 0.5) {
    return NextResponse.json({ error: 'Paiement par QR : 0,50 € minimum (règle Stripe)' }, { status: 400 });
  }

  const { count } = await supabaseAdmin.from('orders').select('id', { count: 'exact', head: true });
  const numero = `SD-${String((count || 0) + 1).padStart(4, '0')}`;
  const libelle = mode === 'qr' ? 'QR code' : 'Carte sans contact (Tap to Pay)';

  const { data: order, error } = await supabaseAdmin.from('orders').insert({
    order_number: numero,
    customer_name: 'Vente au marché',
    status: mode === 'qr' ? 'pending' : 'paid',
    delivery_mode: 'pickup',
    lines: JSON.stringify(lignes),
    subtotal: sousTotal,
    discount: remise,
    shipping: 0,
    total,
    lang: 'fr',
    is_test: test,
    notes: `${REPERE} ${libelle}${b.lieu ? ' · ' + String(b.lieu).slice(0, 80) : ''}`,
  }).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (mode === 'carte') {
    const r = await remettre(order.id);
    let facture: string | null = null;
    /* Pas de facture pour une vente d'essai : la numérotation est
       continue et chaînée, un numéro consommé ne se rend pas. */
    if (!test) try {
      const inv = await createInvoiceFromOrder({ ...order, status: 'delivered', lines: lignes });
      facture = inv?.number || null;
    } catch (e: any) {
      console.error('[caisse] facture non créée', numero, e?.message);
    }
    return NextResponse.json({ ok: true, order_id: order.id, order_number: numero, total, facture, echecs: r.echecs || [] });
  }

  /* QR : session Checkout au montant exact. Une seule ligne « Achat au
     marché » : le détail est sur la facture que le webhook envoie. */
  try {
    const stripe = stripeDe(test);
    const front = (process.env.NEXT_PUBLIC_FRONT_URL || 'https://www.swedishcravings.fr').replace(/\/$/, '');
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      locale: 'fr',
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'eur',
          unit_amount: Math.round(total * 100),
          product_data: { name: `Swedish Cravings — achat au marché (${numero})` },
        },
      }],
      metadata: { order_id: order.id, source: 'caisse' },
      /* 30 min : le minimum Stripe. Une session oubliée expire vite et la
         commande passe « abandonnée » par le webhook habituel. */
      expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
      success_url: `${front}/success.html?order_id=${order.id}`,
      cancel_url: `${front}/`,
    });
    await supabaseAdmin.from('orders').update({ stripe_session_id: session.id }).eq('id', order.id);
    return NextResponse.json({ ok: true, order_id: order.id, order_number: numero, total, url: session.url });
  } catch (e: any) {
    await supabaseAdmin.from('orders').update({ status: 'cancelled' }).eq('id', order.id);
    return NextResponse.json({ error: `Stripe : ${e?.message || 'session impossible'}` }, { status: 502 });
  }
}
