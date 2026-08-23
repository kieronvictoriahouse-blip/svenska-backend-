import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabaseAdmin } from '@/lib/supabase';
import { resolveShipping, INTERNATIONAL_COUNTRIES } from '@/lib/shipping';
import { evaluatePromo } from '@/lib/promo';
import crypto from 'crypto';

const CUSTOMER_SECRET = process.env.CUSTOMER_JWT_SECRET || process.env.SNIPCART_SECRET_KEY || 'sd-customer-secret';

function verifyCustomerToken(token: string): string | null {
  try {
    const dot = token.lastIndexOf('.');
    if (dot === -1) return null;
    const payload = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const expected = crypto.createHmac('sha256', CUSTOMER_SECRET).update(payload).digest('base64url');
    if (sig !== expected) return null;
    const { email, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (!email || Date.now() > exp) return null;
    return email as string;
  } catch { return null; }
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

const ADMIN_TEST_EMAILS = (process.env.ADMIN_TEST_EMAILS || '')
  .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { items, customer_token, delivery_mode, promo_code, customer_note, relay_point_id, relay_point_name, relay_point_address, relay_point_pays } = body;
    let { customer_email } = body;
    const isPickup = delivery_mode === 'pickup';
    const isMondialRelay = delivery_mode === 'mondial_relay';

    const isTestMode = !!customer_email && ADMIN_TEST_EMAILS.includes(customer_email.toLowerCase());
    const stripeKey = isTestMode
      ? (process.env.STRIPE_SECRET_KEY_TEST || process.env.STRIPE_SECRET_KEY)
      : process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) return NextResponse.json({ error: 'Stripe non configuré' }, { status: 500, headers: CORS });

    const stripe = new Stripe(stripeKey, { apiVersion: '2026-04-22.dahlia' });

    // Verify customer token and load profile for name + address
    let customerName = '';
    let customerAddress = '';
    const tokenEmail = customer_token ? verifyCustomerToken(customer_token) : null;
    if (tokenEmail) {
      customer_email = customer_email || tokenEmail;
      const { data: profile } = await supabaseAdmin
        .from('customer_profiles').select('name,address1,city,postal_code,country')
        .eq('email', tokenEmail).maybeSingle();
      if (profile) {
        customerName = profile.name || '';
        if (profile.address1) {
          customerAddress = [profile.address1, profile.city, profile.postal_code, profile.country || 'FR']
            .filter(Boolean).join(', ');
        }
      }
    }
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Panier vide' }, { status: 400, headers: CORS });
    }

    const lineItems: any[] = [];
    const orderLines: Array<{ product_id: string; name: string; name_en?: string; name_sv?: string; qty: number; price: number; image_url?: string }> = [];
    let subtotal = 0;
    let hasPickupOnly = false;
    const stockErrors: Array<{ name: string; available: number; requested: number }> = [];

    /* Calculé une fois pour tout le panier : le réservé se déduit des
       commandes, il ne dépend pas de la ligne qu'on examine. */
    const { quantitesReservees } = await import('@/lib/reserve');
    const reserve = await quantitesReservees();
    const giftClaims: Array<{ id: string }> = [];

    for (const item of items) {
      // Les cadeaux (offerts) sont mis de côté : validés + ajoutés à 0 € après le sous-total.
      if (item && item.gift) { giftClaims.push({ id: item.id }); continue; }
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.id);
      const sortOrder = isUUID ? NaN : parseInt(item.id);
      let q = supabaseAdmin.from('products').select('*, product_variants(*)').eq('is_active', true);
      q = isUUID ? q.eq('id', item.id) : q.eq('sort_order', sortOrder);
      const { data: product } = await q.maybeSingle();
      if (!product) continue;
      if (product.pickup_only) hasPickupOnly = true;

      /* Contrôle de stock côté serveur (l'UI peut être contournée).
         On compare au DISPONIBLE — stock physique moins ce qui est déjà
         dû à des commandes payées non expédiées. Comparer au stock brut
         laisserait vendre deux fois la même boîte : elle est encore en
         rayon, mais elle appartient déjà à quelqu'un. */
      if (product.track_stock === true && typeof product.stock === 'number') {
        const dispo = product.stock - (reserve[product.id] || 0);
        if (dispo <= 0 || item.quantity > dispo) {
          stockErrors.push({
            name: product.name_fr || product.id,
            available: Math.max(0, dispo),
            requested: item.quantity,
          });
        }
      }

      const variant = item.variant
        ? (product.product_variants || []).find((v: { label: string }) => v.label === item.variant)
        : null;
      const price    = variant ? variant.price : product.price;
      const suffix   = item.variant ? ` — ${item.variant}` : '';
      const name     = (product.name_fr || '') + suffix;
      const name_en  = (product.name_en || product.name_fr || '') + suffix;
      const name_sv  = (product.name_sv || product.name_fr || '') + suffix;

      subtotal += price * item.quantity;

      orderLines.push({ product_id: product.id, name, name_en, name_sv, qty: item.quantity, price, ...(product.image_url ? { image_url: product.image_url } : {}) });

      lineItems.push({
        price_data: {
          currency: 'eur',
          product_data: { name },
          unit_amount: Math.round(price * 100),
        },
        quantity: item.quantity,
      });
    }

    if (lineItems.length === 0) {
      return NextResponse.json({ error: 'Produits introuvables' }, { status: 400, headers: CORS });
    }

    // Stock insuffisant → on refuse la commande AVANT tout paiement.
    if (stockErrors.length > 0) {
      return NextResponse.json(
        { error: 'Stock insuffisant pour un ou plusieurs articles.', code: 'OUT_OF_STOCK', items: stockErrors },
        { status: 409, headers: CORS },
      );
    }

    // ── Cadeau offert : validé 100% côté serveur (impossible de forcer un produit gratuit) ──
    // On n'ajoute le cadeau à 0 € que si : offre gift active + valide, sous-total (hors cadeau)
    // ≥ seuil, et le produit demandé fait bien partie des cadeaux éligibles.
    if (giftClaims.length > 0) {
      try {
        const now = new Date();
        const { data: gifts } = await supabaseAdmin
          .from('promo_codes').select('*').eq('type', 'gift').eq('is_active', true)
          .order('created_at', { ascending: false });
        const offer = (gifts || []).find((p: any) => {
          const dateOk = (!p.valid_from || now >= new Date(p.valid_from)) &&
            (!p.valid_until || now <= new Date(String(p.valid_until).slice(0, 10) + 'T23:59:59'));
          return dateOk && (!p.max_uses || (p.used_count || 0) < p.max_uses);
        });
        /* Combien de cadeaux le panier merite REELLEMENT — calcule ici,
           jamais depuis le panier. « 2 Piffi achetes, 1 dip offert »
           peut en accorder plusieurs ; l'ancien code n'en donnait qu'un
           quoi qu'il arrive. */
        const { cadeauxDus, listeIds } = await import('@/lib/cadeau');
        const dus = cadeauxDus(offer, items, subtotal);

        if (offer && dus > 0) {
          const ids = listeIds((offer as any).gift_product_ids);
          /* On sert les cadeaux demandes, dans l'ordre, jusqu'a
             concurrence de ce qui est du. Un client qui en reclame trois
             pour deux merites en recoit deux. */
          const retenus = giftClaims.filter(g => ids.includes(g.id)).slice(0, dus);

          for (const claim of retenus) {
            const { data: gp } = await supabaseAdmin
              .from('products')
              .select('id, name_fr, name_en, name_sv, image_url, is_active, track_stock, stock')
              .eq('id', claim.id).eq('is_active', true).maybeSingle();
            /* Un cadeau en rupture n'est pas un cadeau : on l'omet
               plutot que de promettre ce qu'on ne peut pas mettre dans
               le carton. Le disponible tient compte du reserve. */
            const dispo = gp ? (Number(gp.stock) || 0) - (reserve[gp.id] || 0) : 0;
            const servable = gp && !(gp.track_stock === true && dispo <= 0);
            if (gp && servable) {
              orderLines.push({
                product_id: gp.id,
                name: (gp.name_fr || 'Cadeau') + ' (offert)',
                name_en: (gp.name_en || gp.name_fr || 'Gift') + ' (free gift)',
                name_sv: (gp.name_sv || gp.name_fr || 'Gåva') + ' (gåva)',
                qty: 1, price: 0,
                ...(gp.image_url ? { image_url: gp.image_url } : {}),
              });
            }
          }
        }
      } catch (giftErr) {
        console.warn('[checkout] gift error (non-fatal):', giftErr);
      }
    }

    // Verrou : un produit "retrait uniquement" (frais, fragile…) impose le click & collect
    // pour toute la commande. On refuse tout autre mode côté serveur (l'UI peut être contournée).
    if (hasPickupOnly && !isPickup) {
      return NextResponse.json(
        { error: 'Votre panier contient un produit disponible en retrait en magasin uniquement (click & collect). Sélectionnez ce mode de livraison pour finaliser la commande.', code: 'PICKUP_ONLY' },
        { status: 400, headers: CORS },
      );
    }

    console.log('[checkout] lineItems:', JSON.stringify(lineItems), 'subtotal:', subtotal);

    if (subtotal <= 0) {
      return NextResponse.json({ error: 'Subtotal invalide (prix produit à 0 ou manquant en base)', subtotal }, { status: 400, headers: CORS });
    }

    // Promo code validation
    let discountAmount = 0;
    let stripeCouponId: string | null = null;
    let promoCodeId: string | null = null;
    let isFreeShippingPromo = false;

    if (promo_code && typeof promo_code === 'string') {
      try {
        const { data: promo } = await supabaseAdmin
          .from('promo_codes')
          .select('*')
          .eq('code', promo_code.toUpperCase().trim())
          .eq('is_active', true)
          .maybeSingle();

        if (promo) {
          // Vérifie l'usage client avant d'évaluer (une seule requête, si utile)
          let alreadyUsedByCustomer = false;
          if (promo.single_use_per_customer && customer_email) {
            const { data: existingUsage } = await supabaseAdmin
              .from('promo_code_usages')
              .select('id')
              .eq('promo_code_id', promo.id)
              .eq('customer_email', customer_email.toLowerCase())
              .maybeSingle();
            alreadyUsedByCustomer = !!existingUsage;
          }

          // Mêmes règles que /api/promo/validate — cf. @/lib/promo
          const verdict = evaluatePromo(promo, { subtotal, alreadyUsedByCustomer });
          if (verdict.ok) {
            promoCodeId = promo.id;
            if (promo.type === 'percent') {
              const coupon = await stripe.coupons.create({ percent_off: promo.value, duration: 'once' });
              stripeCouponId = coupon.id;
              discountAmount = (subtotal * promo.value) / 100;
            } else if (promo.type === 'fixed') {
              const discAmt = Math.min(subtotal, promo.value);
              const coupon = await stripe.coupons.create({ amount_off: Math.round(discAmt * 100), currency: 'eur', duration: 'once' });
              stripeCouponId = coupon.id;
              discountAmount = discAmt;
            } else if (promo.type === 'free_shipping') {
              isFreeShippingPromo = true;
            }
          }
        }
      } catch (promoErr) {
        console.warn('[checkout] promo code error (non-fatal):', promoErr);
      }
    }

    const relayCountry = (relay_point_pays || 'FR').toUpperCase();
    const isInternational = isMondialRelay && INTERNATIONAL_COUNTRIES.includes(relayCountry);

    // Barème + opération « livraison offerte » : le serveur fait autorité,
    // le front n'affiche qu'une estimation.
    const { data: shipCfg } = await supabaseAdmin
      .from('white_label_config').select('*').limit(1).maybeSingle();
    const shipRules = resolveShipping(shipCfg, { isInternational });

    const freeShipping = subtotal >= shipRules.threshold || isFreeShippingPromo;
    const shippingCost = isPickup ? 0 : (freeShipping ? 0 : shipRules.cost);
    const grandTotal = Math.max(0, subtotal - discountAmount) + shippingCost;
    if (grandTotal < 0.50) {
      return NextResponse.json({ error: `Total minimum de commande non atteint (${grandTotal.toFixed(2)} € < 0.50 €)` }, { status: 400, headers: CORS });
    }

    // Créer la commande en statut pending AVANT Stripe
    const { count: orderCount } = await supabaseAdmin
      .from('orders').select('id', { count: 'exact', head: true });
    const num = String((orderCount || 0) + 1).padStart(4, '0');

    const { data: draftOrder } = await supabaseAdmin
      .from('orders')
      .insert({
        order_number:     `SD-${num}`,
        status:           'pending',
        customer_email:   customer_email || null,
        customer_name:    customerName || null,
        // For pickup, Stripe won't collect address — store profile address now
        ...(isPickup && customerAddress ? { shipping_address: customerAddress } : {}),
        subtotal,
        shipping:         shippingCost,
        discount:         discountAmount > 0 ? Math.round(discountAmount * 100) / 100 : 0,
        total:            grandTotal,
        lines:            orderLines,
        delivery_mode:    isPickup ? 'pickup' : isMondialRelay ? 'mondial_relay' : 'delivery',
        ...(isTestMode ? { is_test: true } : {}),
        ...(isMondialRelay && relay_point_id ? {
          relay_point_id,
          relay_point_name: relay_point_name || null,
          relay_point_address: relay_point_address || null,
          relay_point_pays: relay_point_pays || 'FR',
        } : {}),
        ...(promo_code && discountAmount > 0 ? { promo_code: promo_code.toUpperCase().trim() } : {}),
        ...(promo_code && isFreeShippingPromo ? { promo_code: promo_code.toUpperCase().trim() } : {}),
        ...(customer_note ? { notes: customer_note } : {}),
      })
      .select()
      .single();

    const baseUrl = process.env.NEXT_PUBLIC_FRONT_URL || '';
    const orderId = draftOrder?.id || '';
    const successUrl = `${baseUrl}/success.html?order_id=${orderId}`;
    const cancelUrl  = `${baseUrl}/panier.html`;
    console.log('[checkout] successUrl:', successUrl, 'orderId:', orderId);

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      customer_email: customer_email || undefined,
      // Stripe collecte le téléphone (plus de gate custom nom/téléphone côté front)
      phone_number_collection: { enabled: true },
      // Toujours une adresse de facturation → factures complètes même en
      // retrait/relais (où aucune adresse de livraison n'est demandée).
      billing_address_collection: 'required',
      ...(stripeCouponId ? { discounts: [{ coupon: stripeCouponId }] } : {}),
      ...(isPickup || isMondialRelay ? {} : {
        shipping_address_collection: { allowed_countries: ['FR', 'BE', 'CH', 'LU', 'MC', 'DE', 'ES', 'IT', 'NL', 'PT', 'SE', 'GB'] },
      }),
      shipping_options: [
        isPickup
          ? {
              shipping_rate_data: {
                type: 'fixed_amount',
                fixed_amount: { amount: 0, currency: 'eur' },
                display_name: 'Retrait en magasin (Click & Collect)',
              },
            }
          : isMondialRelay
          ? {
              shipping_rate_data: {
                type: 'fixed_amount',
                fixed_amount: { amount: freeShipping ? 0 : Math.round(shipRules.cost * 100), currency: 'eur' },
                display_name: freeShipping
                  ? 'Livraison gratuite en point relais'
                  : isInternational
                  ? `Livraison en point relais — International (${shipRules.cost.toFixed(2)} €)`
                  : 'Livraison en point relais',
              },
            }
          : freeShipping
          ? {
              shipping_rate_data: {
                type: 'fixed_amount',
                fixed_amount: { amount: 0, currency: 'eur' },
                display_name: 'Livraison gratuite',
              },
            }
          : {
              shipping_rate_data: {
                type: 'fixed_amount',
                fixed_amount: { amount: 490, currency: 'eur' },
                display_name: 'Livraison standard',
              },
            },
      ],
      metadata: { order_id: draftOrder?.id || '' },
      success_url: successUrl,
      cancel_url:  cancelUrl,
      locale: 'fr',
    });

    // Increment promo usage counter + track per-user usage
    if (promoCodeId) {
      try {
        const { data: p } = await supabaseAdmin.from('promo_codes').select('used_count, single_use_per_customer').eq('id', promoCodeId).single();
        await supabaseAdmin.from('promo_codes').update({ used_count: (p?.used_count || 0) + 1 }).eq('id', promoCodeId);
        if (p?.single_use_per_customer && customer_email) {
          await supabaseAdmin.from('promo_code_usages').upsert(
            { promo_code_id: promoCodeId, customer_email: customer_email.toLowerCase() },
            { onConflict: 'promo_code_id,customer_email', ignoreDuplicates: true }
          );
        }
      } catch (e) {
        /* Non bloquant : la session de paiement est creee, refuser ici
           empecherait la vente. Mais l'usage unique du code ne sera pas
           enregistre, donc le code restera reutilisable — il faut le
           savoir. */
        console.error('[checkout] usage du code promo non enregistre', e);
      }
    }

    return NextResponse.json({ url: session.url }, { headers: CORS });
  } catch (e: unknown) {
    const err = e as any;
    const msg   = err?.message || 'Unknown error';
    const type  = err?.type  || err?.name  || '';
    const param = err?.param || '';
    const code  = err?.code  || err?.statusCode || '';
    console.error('[checkout]', JSON.stringify({ msg, type, param, code }));
    return NextResponse.json({ error: msg, type, param, code }, { status: 500, headers: CORS });
  }
}
