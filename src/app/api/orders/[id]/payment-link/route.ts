import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';
import { getWhiteLabelConfig, sendEmail, baseTemplate } from '@/lib/email-send';
import { normDevise, deviseStripe, versMinor, montantMinimum, formatMontant } from '@/lib/devise';
import { boutiqueStricte, codeBoutique, BOUTIQUE_DEFAUT } from '@/lib/boutique';

export const dynamic = 'force-dynamic';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireAuth(req)) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401, headers: CORS });
  }

  let sendEmailFlag = false;
  try { const body = await req.json(); sendEmailFlag = !!body.send_email; } catch {}

  const { data: order } = await supabaseAdmin
    .from('orders').select('*').eq('id', params.id).maybeSingle();
  if (!order) {
    return NextResponse.json({ error: 'Commande introuvable' }, { status: 404, headers: CORS });
  }
  /* Un lien de paiement ne se fait que pour une commande pas encore
     payée : sur une commande payée (ou annulée), il fait payer deux fois. */
  if (!['pending', 'abandoned'].includes(order.status)) {
    return NextResponse.json(
      { error: `Commande au statut « ${order.status} » : pas de lien de paiement.` },
      { status: 409, headers: CORS });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return NextResponse.json({ error: 'Stripe non configuré' }, { status: 500, headers: CORS });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: '2026-04-22.dahlia' });
  /* Étape 3 : le lien encaisse dans la devise de LA commande (EUR pour
     Swedish Cravings, posé par la base), sur la vitrine de sa boutique. */
  const devise = normDevise(order.currency);
  const enEuro = devise === 'EUR';
  const cur = deviseStripe(devise);
  const codeB = order.boutique_id || 'sc';
  /* La devise de la commande doit être celle de sa boutique : une commande
     créée hors checkout (POST /api/orders, repli du webhook…) garde le
     défaut 'EUR' de la base même si ses lignes sont en SEK — le lien
     débiterait alors 149 kr comme 149 €. On refuse plutôt. Swedish
     Cravings ne lit pas la base ici (fiche en dur) et passe toujours. */
  const ficheB = await boutiqueStricte(codeB);
  if (!ficheB || (codeBoutique(codeB) !== BOUTIQUE_DEFAUT && ficheB.actif === false) || normDevise(ficheB.devise) !== devise) {
    return NextResponse.json(
      { error: 'Devise de la commande incohérente avec sa boutique (ou boutique indisponible) : lien refusé.' },
      { status: 409, headers: CORS });
  }

  const lines: any[] = typeof order.lines === 'string' ? JSON.parse(order.lines) : (order.lines || []);

  const lineItems: any[] = lines
    .filter((l: any) => (l.price || 0) > 0)
    .map((l: any) => ({
      price_data: {
        currency: cur,
        product_data: { name: (l.desc || l.name || l.name_fr || 'Article').substring(0, 127) },
        unit_amount: versMinor(l.price || 0, devise),
      },
      quantity: l.qty || 1,
    }));

  // La remise ne s'applique qu'aux lignes au prix catalogue, pas au repli (déjà remisé).
  const depuisLignes = lineItems.length > 0;

  // Fallback : le total comme ligne unique
  if (lineItems.length === 0) {
    const amount = versMinor((order.total || 0) - (order.shipping || 0), devise);
    if (amount > 0) {
      lineItems.push({
        price_data: {
          currency: cur,
          product_data: { name: `Commande ${order.order_number}` },
          unit_amount: amount,
        },
        quantity: 1,
      });
    }
  }

  if (lineItems.length === 0) {
    return NextResponse.json(
      { error: 'Impossible de créer le lien (montant nul)' },
      { status: 400, headers: CORS }
    );
  }

  const { urlVitrine } = await import('@/lib/urls-instance');
  const baseUrl = await urlVitrine(codeB);
  const shippingAmt = versMinor(order.shipping || 0, devise);

  /* La remise de la commande (code promo saisi à la création) : sans
     elle, le lien faisait payer les articles au prix plein et le client
     réglait plus que le total de sa commande et de sa facture. */
  const remiseCts = depuisLignes ? versMinor(Number(order.discount) || 0, devise) : 0;
  /* Code promo de SA boutique : deux vitrines peuvent avoir le même code.
     Swedish Cravings garde la lecture d'avant, sans filtre. */
  let reqPromo = supabaseAdmin.from('promo_codes').select('id').eq('code', String(order.promo_code || '').toUpperCase().trim());
  if (codeB !== 'sc') reqPromo = reqPromo.eq('boutique_id', codeB);
  const promoId = order.promo_code
    ? (await reqPromo.maybeSingle()).data?.id || null
    : null;

  /* Hors euro : le minimum Stripe de la devise est vérifié ici, avant
     d'expirer l'ancien lien (refus clair plutôt qu'erreur Stripe). */
  if (!enEuro) {
    const aPayer = lineItems.reduce((s: number, li: any) => s + li.price_data.unit_amount * li.quantity, 0)
      - remiseCts + Math.max(0, shippingAmt);
    if (aPayer < versMinor(montantMinimum(devise), devise)) {
      return NextResponse.json(
        { error: `Montant inférieur au minimum de paiement (${formatMontant(montantMinimum(devise), devise, 'fr')}).` },
        { status: 400, headers: CORS });
    }
  }

  let session: Stripe.Checkout.Session;
  try {
    /* Régénérer laissait l'ancien lien valable 7 jours : le client qui
       payait les deux était débité deux fois. On l'expire d'abord. */
    const ancien = String(order.payment_link_url || '').match(/cs_(?:live|test)_[A-Za-z0-9]+/)?.[0];
    if (ancien) {
      /* L'ancien lien a peut-être déjà été payé (webhook manqué : la
         commande est restée « en attente ») : en refaire un ferait payer
         une seconde fois. */
      const prec = await stripe.checkout.sessions.retrieve(ancien).catch(() => null);
      if (prec?.payment_status === 'paid') {
        return NextResponse.json(
          { error: 'Le lien précédent a déjà été payé (paiement pas encore remonté) : vérifie dans Stripe avant d’en refaire un.' },
          { status: 409, headers: CORS });
      }
      await stripe.checkout.sessions.expire(ancien).catch(() => {});
    }

    const coupon = remiseCts > 0
      ? await stripe.coupons.create({ amount_off: remiseCts, currency: cur, duration: 'once' })
      : null;

    session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      ...(coupon ? { discounts: [{ coupon: coupon.id }] } : {}),
      customer_email: order.customer_email || undefined,
      ...(shippingAmt >= 0 ? {
        shipping_options: [{
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: { amount: shippingAmt, currency: cur },
            display_name: shippingAmt > 0 ? 'Livraison' : 'Livraison offerte',
          },
        }],
      } : {}),
      /* promo_code_id : l'usage du code se compte au paiement, par le
         webhook — comme pour une commande passée sur le site. */
      metadata: { order_id: order.id, ...(promoId ? { promo_code_id: promoId } : {}), ...(!enEuro ? { boutique: codeB } : {}) },
      /* Hors euro seulement : commande retrouvable depuis le paiement, et
         Adaptive Pricing coupé (le client paie dans la devise de la commande). */
      ...(!enEuro ? {
        payment_intent_data: { metadata: { order_id: order.id, order_number: order.order_number, boutique: codeB } },
        adaptive_pricing: { enabled: false },
      } : {}),
      success_url: `${baseUrl}/success.html?order_id=${order.id}`,
      cancel_url:  `${baseUrl}/panier.html`,
      locale: 'fr',
      expires_at: Math.floor(Date.now() / 1000) + 86400 * 7,
    });
  } catch (err: any) {
    console.error('[payment-link] Stripe error:', err.message);
    return NextResponse.json({ error: `Stripe : ${err.message}` }, { status: 500, headers: CORS });
  }

  const url = session.url!;

  await supabaseAdmin.from('orders').update({
    payment_link_url:     url,
    payment_link_sent_at: new Date().toISOString(),
  }).eq('id', order.id);

  if (sendEmailFlag && order.customer_email) {
    try {
      const cfg = await getWhiteLabelConfig();
      const siteName  = (cfg as any).site_name || '';
      const fromEmail = (cfg as any).smtp_from || process.env.SMTP_FROM || process.env.RESEND_FROM || 'onboarding@resend.dev';

      const body = `
        <h1 class="title">Finalisez votre commande</h1>
        <p class="text">Bonjour ${order.customer_name || ''},</p>
        <p class="text">Votre commande <strong>${order.order_number}</strong> d'un montant de <strong>${enEuro ? `${(order.total || 0).toFixed(2)} €` : formatMontant(order.total || 0, devise, 'fr')}</strong> est prête à être réglée.</p>
        <div style="text-align:center;margin:28px 0">
          <a href="${url}" style="display:inline-block;background:#3E5238;color:#fff;padding:14px 32px;border-radius:4px;font-size:15px;text-decoration:none;letter-spacing:1px">Payer ma commande →</a>
        </div>
        <p style="font-size:12px;color:#9CA3AF;text-align:center;margin-top:8px">Ce lien est valable 7 jours.</p>
      `;

      await sendEmail({
        from:    fromEmail,
        to:      order.customer_email,
        subject: `💳 Finalisez votre commande ${order.order_number} — ${siteName}`,
        html:    baseTemplate(body, `Votre commande ${order.order_number}`, cfg),
      }, cfg as any);
    } catch (err: any) {
      console.warn('[payment-link] email error (non-fatal):', err.message);
    }
  }

  return NextResponse.json({ url }, { headers: CORS });
}
