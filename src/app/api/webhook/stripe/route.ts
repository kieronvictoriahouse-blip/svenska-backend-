import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabaseAdmin } from '@/lib/supabase';
import { orderConfirmationHtml, getWlConfig } from '@/lib/mailer';
import { sendEmail } from '@/lib/email-send';

export async function POST(req: NextRequest) {
  const stripeKey        = process.env.STRIPE_SECRET_KEY;
  const stripeKeyTest    = process.env.STRIPE_SECRET_KEY_TEST;
  const webhookSecret    = process.env.STRIPE_WEBHOOK_SECRET;
  const webhookSecretTest = process.env.STRIPE_WEBHOOK_SECRET_TEST;
  if (!stripeKey) return NextResponse.json({ error: 'no key' }, { status: 500 });

  const body = await req.text();
  const sig  = req.headers.get('stripe-signature') || '';

  let event: Stripe.Event;
  let isTestEvent = false;
  try {
    // Try live secret first, then test secret
    if (webhookSecret) {
      try {
        const stripe = new Stripe(stripeKey, { apiVersion: '2026-04-22.dahlia' });
        event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
      } catch {
        if (webhookSecretTest && stripeKeyTest) {
          const stripeTest = new Stripe(stripeKeyTest, { apiVersion: '2026-04-22.dahlia' });
          event = stripeTest.webhooks.constructEvent(body, sig, webhookSecretTest);
          isTestEvent = true;
        } else {
          throw new Error('Invalid webhook signature');
        }
      }
    } else {
      event = JSON.parse(body);
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'invalid';
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // Use the correct Stripe instance for this event
  const activeKey = isTestEvent && stripeKeyTest ? stripeKeyTest : stripeKey;
  const stripe = new Stripe(activeKey, { apiVersion: '2026-04-22.dahlia' });
  if (!isTestEvent) isTestEvent = !(event as any).livemode;

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as any;

    const shipping        = session.shipping_details as { name?: string; address?: { line1?: string; line2?: string; postal_code?: string; city?: string; country?: string } } | null;
    const shippingAddress = shipping?.address
      ? [shipping.address.line1, shipping.address.line2, `${shipping.address.postal_code} ${shipping.address.city}`, shipping.address.country]
          .filter(Boolean).join(', ')
      : '';

    const customerName  = shipping?.name || session.customer_details?.name || '';
    const customerEmail = session.customer_details?.email || '';
    const total         = (session.amount_total || 0) / 100;
    const shippingCost  = session.shipping_cost?.amount_total ? session.shipping_cost.amount_total / 100 : 0;

    const orderId = session.metadata?.order_id;

    if (orderId) {
      // Commande draft créée au checkout → mettre à jour
      const { data: existing } = await supabaseAdmin
        .from('orders').select('*').eq('id', orderId).single();

      const orderLines = existing?.lines
        ? (typeof existing.lines === 'string' ? JSON.parse(existing.lines) : existing.lines)
        : [];

      const subtotal = total - shippingCost;

      await supabaseAdmin.from('orders').update({
        customer_name:    customerName,
        customer_email:   customerEmail,
        shipping_address: shippingAddress,
        subtotal:         subtotal > 0 ? subtotal : total,
        shipping:         shippingCost,
        total,
        status:           'paid',
        stripe_session_id: session.id,
        updated_at:       new Date().toISOString(),
      }).eq('id', orderId);

      // Annuler les brouillons en attente du même client (doublons de checkout)
      if (customerEmail) {
        await supabaseAdmin.from('orders')
          .update({ status: 'cancelled', updated_at: new Date().toISOString() })
          .eq('customer_email', customerEmail)
          .eq('status', 'pending')
          .neq('id', orderId);
      }

      // Décrémenter le stock
      for (const line of orderLines) {
        if (line.product_id) {
          try { await supabaseAdmin.rpc('decrement_stock', { p_id: line.product_id, qty: line.qty }); } catch { /* non bloquant */ }
        }
      }

      // Facture + compta : skip pour les commandes test
      if (isTestEvent || existing?.is_test) { /* skip */ } else
      // Facture automatique via invoice-utils (format correct)
      try {
        const { data: existingInv } = await supabaseAdmin
          .from('invoices').select('id').eq('order_id', orderId).maybeSingle();

        if (!existingInv) {
          const { createInvoiceFromOrder } = await import('@/lib/invoice-utils');
          const invoice = await createInvoiceFromOrder({
            ...existing,
            customer_name:    customerName,
            customer_email:   customerEmail,
            shipping_address: shippingAddress,
            subtotal:         subtotal > 0 ? subtotal : total,
            shipping:         shippingCost,
            total,
            lines:            orderLines,
            status:           'paid',
          });

          if (invoice?.number) {
            await supabaseAdmin.from('orders')
              .update({ invoice_number: invoice.number }).eq('id', orderId);
          }
        }

        // Entrée comptable automatique
        const { data: existingEntry } = await supabaseAdmin
          .from('accounting_entries').select('id')
          .eq('reference_type', 'order').eq('reference_id', orderId).eq('type', 'income')
          .maybeSingle();
        if (!existingEntry) {
          await supabaseAdmin.from('accounting_entries').insert({
            date:             new Date().toISOString().split('T')[0],
            type:             'income',
            category:         'vente_en_ligne',
            description:      `Commande ${existing?.order_number || ''}${customerName ? ' — ' + customerName : ''}`,
            amount:           total,
            reference_type:   'order',
            reference_id:     orderId,
            reference_number: existing?.order_number || '',
          });
        }

        // Frais Stripe automatiques (~1,5% + 0,25€ par transaction)
        const { data: existingStripeEntry } = await supabaseAdmin
          .from('accounting_entries').select('id')
          .eq('reference_type', 'order').eq('reference_id', orderId).eq('category', 'frais_stripe')
          .maybeSingle();
        if (!existingStripeEntry && total > 0) {
          const stripeFee = Math.round((total * 0.015 + 0.25) * 100) / 100;
          await supabaseAdmin.from('accounting_entries').insert({
            date:             new Date().toISOString().split('T')[0],
            type:             'expense',
            category:         'frais_stripe',
            description:      `Frais Stripe — ${existing?.order_number || ''}`,
            amount:           stripeFee,
            reference_type:   'order',
            reference_id:     orderId,
            reference_number: existing?.order_number || '',
          });
        }
      } catch (invErr) {
        console.error('[webhook] invoice/accounting error:', invErr);
      }

      // Email de confirmation
      try {
        const cfg = await getWlConfig();
        const siteName  = cfg.site_name || '';
        const fromEmail = cfg.smtp_from || process.env.SMTP_FROM || process.env.RESEND_FROM || 'hej@swedishcravings.fr';

        const orderForEmail = {
          ...(existing || {}),
          customer_name:    customerName,
          customer_email:   customerEmail,
          shipping_address: shippingAddress,
          subtotal:         subtotal > 0 ? subtotal : total,
          shipping:         shippingCost,
          total,
          lines:            orderLines,
        };

        await sendEmail({
          from:    fromEmail,
          to:      customerEmail,
          subject: `✅ Commande ${existing?.order_number || ''} confirmée${siteName ? ` — ${siteName}` : ''}`,
          html:    orderConfirmationHtml(orderForEmail, cfg),
        }, cfg);

        // Second email facture
        if (!isTestEvent && !existing?.is_test) {
          try {
            const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://admin.swedishcravings.fr';
            await fetch(`${baseUrl}/api/send-invoice-email`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ order_id: orderId, secret: process.env.INTERNAL_SECRET || 'svenska-internal-2024' }),
            });
          } catch (invMailErr) {
            console.error('[webhook] invoice email error:', invMailErr);
          }
        }
      } catch (emailErr) {
        console.error('[webhook] email error:', emailErr);
      }

    } else {
      // Fallback : ancienne logique sans draft order
      const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 100 });
      const lines = lineItems.data.map((li) => ({
        name:  li.description,
        qty:   li.quantity,
        price: (li.amount_total || 0) / 100 / (li.quantity || 1),
      }));

      const { count: orderCount } = await supabaseAdmin
        .from('orders').select('id', { count: 'exact', head: true });
      const num = String((orderCount || 0) + 1).padStart(4, '0');

      await supabaseAdmin.from('orders').insert({
        order_number:     `SD-${num}`,
        customer_name:    customerName,
        customer_email:   customerEmail,
        shipping_address: shippingAddress,
        total,
        status:           'paid',
        lines:            JSON.stringify(lines),
        stripe_session_id: session.id,
      });
    }
  }

  return NextResponse.json({ received: true });
}
