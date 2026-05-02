import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// POST /api/snipcart/webhook
// Reçoit les événements Snipcart après paiement
export async function POST(req: NextRequest) {
  // ── Vérification signature ──────────────────────────────────
  const token = req.headers.get('x-snipcart-requesttoken');
  const secretKey = process.env.SNIPCART_SECRET_KEY;

  if (token && secretKey) {
    try {
      const check = await fetch(
        `https://app.snipcart.com/api/requestvalidation/${token}`,
        {
          headers: {
            Authorization: 'Basic ' + Buffer.from(`${secretKey}:`).toString('base64'),
            Accept: 'application/json',
          },
        }
      );
      if (!check.ok) {
        return NextResponse.json({ error: 'Invalid webhook token' }, { status: 401 });
      }
    } catch {
      return NextResponse.json({ error: 'Cannot verify webhook' }, { status: 500 });
    }
  }

  // ── Parse event ────────────────────────────────────────────
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const eventName: string = body.eventName || '';
  const content: any = body.content || {};

  // ── order.completed ────────────────────────────────────────
  if (eventName === 'order.completed') {
    await handleOrderCompleted(content);
  }

  // ── order.status.changed ───────────────────────────────────
  if (eventName === 'order.status.changed') {
    await handleOrderStatusChanged(content);
  }

  // ── order.refunded ─────────────────────────────────────────
  if (eventName === 'order.refunded') {
    await supabaseAdmin
      .from('orders')
      .update({ status: 'refunded' })
      .eq('snipcart_token', content.token);
  }

  return NextResponse.json({ received: true });
}

async function handleOrderCompleted(content: any) {
  // Éviter les doublons si Snipcart renvoie deux fois
  const existing = await supabaseAdmin
    .from('orders')
    .select('id')
    .eq('snipcart_token', content.token)
    .maybeSingle();

  if (existing.data) return;

  // Numéro de commande séquentiel
  const { count: orderCount } = await supabaseAdmin
    .from('orders')
    .select('id', { count: 'exact', head: true });
  const num = String((orderCount || 0) + 1).padStart(4, '0');

  // Lignes de commande
  const lines = (content.items || []).map((item: any) => ({
    id:       item.id,
    name:     item.name,
    qty:      item.quantity,
    price:    item.price,
    total:    item.totalPrice,
    variant:  item.customFields?.[0]?.value || null,
  }));

  // Créer la commande
  await supabaseAdmin.from('orders').insert({
    order_number:     `SD-${num}`,
    snipcart_token:   content.token,
    snipcart_invoice: content.invoiceNumber || null,
    status:           'paid',
    customer_name:    content.billingAddress?.name || content.email,
    customer_email:   content.email,
    shipping_address: content.shippingAddress || {},
    billing_address:  content.billingAddress || {},
    lines,
    subtotal:         content.subtotal       || 0,
    shipping:         content.shippingInformation?.fees || content.shippingRate || 0,
    total:            content.total          || 0,
  });

  // Décrémenter le stock pour chaque ligne
  for (const item of content.items || []) {
    // item.id = "3" ou "3_50g" (sort_order ou sort_order_variant)
    const sortOrder = parseInt(item.id.split('_')[0]);
    if (isNaN(sortOrder)) continue;

    const { data: product } = await supabaseAdmin
      .from('products')
      .select('id')
      .eq('sort_order', sortOrder)
      .maybeSingle();

    if (product?.id) {
      await supabaseAdmin.rpc('decrement_stock', {
        p_id: product.id,
        qty:  item.quantity,
      });
    }
  }
}

async function handleOrderStatusChanged(content: any) {
  const statusMap: Record<string, string> = {
    Paid:       'paid',
    Shipped:    'shipped',
    Delivered:  'delivered',
    Cancelled:  'cancelled',
    Refunded:   'refunded',
  };
  const newStatus = statusMap[content.status] || content.status?.toLowerCase();
  if (!newStatus) return;

  await supabaseAdmin
    .from('orders')
    .update({ status: newStatus })
    .eq('snipcart_token', content.token);
}
