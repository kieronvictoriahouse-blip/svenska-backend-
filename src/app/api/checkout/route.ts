import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabaseAdmin } from '@/lib/supabase';
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

export async function POST(req: NextRequest) {
  try {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) return NextResponse.json({ error: 'Stripe non configuré' }, { status: 500, headers: CORS });

    const stripe = new Stripe(stripeKey, { apiVersion: '2026-04-22.dahlia' });

    const body = await req.json();
    const { items, customer_token, delivery_mode } = body;
    let { customer_email } = body;
    const isPickup = delivery_mode === 'pickup';

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
    const orderLines: Array<{ product_id: string; name: string; name_en?: string; name_sv?: string; qty: number; price: number }> = [];
    let subtotal = 0;

    for (const item of items) {
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.id);
      const sortOrder = isUUID ? NaN : parseInt(item.id);
      let q = supabaseAdmin.from('products').select('*, product_variants(*)').eq('is_active', true);
      q = isUUID ? q.eq('id', item.id) : q.eq('sort_order', sortOrder);
      const { data: product } = await q.maybeSingle();
      if (!product) continue;

      const variant = item.variant
        ? (product.product_variants || []).find((v: { label: string }) => v.label === item.variant)
        : null;
      const price    = variant ? variant.price : product.price;
      const suffix   = item.variant ? ` — ${item.variant}` : '';
      const name     = (product.name_fr || '') + suffix;
      const name_en  = (product.name_en || product.name_fr || '') + suffix;
      const name_sv  = (product.name_sv || product.name_fr || '') + suffix;

      subtotal += price * item.quantity;

      orderLines.push({ product_id: product.id, name, name_en, name_sv, qty: item.quantity, price });

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

    console.log('[checkout] lineItems:', JSON.stringify(lineItems), 'subtotal:', subtotal);

    if (subtotal <= 0) {
      return NextResponse.json({ error: 'Subtotal invalide (prix produit à 0 ou manquant en base)', subtotal }, { status: 400, headers: CORS });
    }

    const freeShipping = subtotal >= 50;
    const shippingCost = isPickup ? 0 : (freeShipping ? 0 : 4.90);
    const grandTotal = subtotal + shippingCost;
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
        total:            subtotal + shippingCost,
        lines:            JSON.stringify(orderLines),
        delivery_mode:    isPickup ? 'pickup' : 'delivery',
      })
      .select()
      .single();

    const baseUrl = 'https://www.swedishcravings.fr';
    const orderId = draftOrder?.id || '';
    const successUrl = `${baseUrl}/success.html?order_id=${orderId}`;
    const cancelUrl  = `${baseUrl}/panier.html`;
    console.log('[checkout] successUrl:', successUrl, 'orderId:', orderId);

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      customer_email: customer_email || undefined,
      ...(isPickup ? {} : {
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
