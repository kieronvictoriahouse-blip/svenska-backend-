import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabaseAdmin } from '@/lib/supabase';
import { sendEmail, orderConfirmationHtml, getWlConfig } from '@/lib/mailer';

// One-time endpoint to replay completed Stripe sessions for pending orders
// GET /api/admin/replay-orders?secret=IMPORT_SECRET
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  if (secret !== process.env.IMPORT_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return NextResponse.json({ error: 'no stripe key' }, { status: 500 });

  const stripe = new Stripe(stripeKey, { apiVersion: '2026-04-22.dahlia' });

  // Fetch pending orders from Supabase
  const { data: pendingOrders } = await supabaseAdmin
    .from('orders')
    .select('id, order_number, status, lines')
    .eq('status', 'pending');

  if (!pendingOrders || pendingOrders.length === 0) {
    return NextResponse.json({ message: 'No pending orders', updated: 0 });
  }

  const pendingIds = new Set(pendingOrders.map(o => o.id));

  // List recent completed Stripe checkout sessions (last 7 days)
  const sessions = await stripe.checkout.sessions.list({
    limit: 100,
  } as any);

  const updated: string[] = [];
  const errors: string[] = [];

  for (const session of sessions.data) {
    if (session.status !== 'complete') continue;
    const orderId = session.metadata?.order_id;
    if (!orderId || !pendingIds.has(orderId)) continue;

    try {
      const s = session as any;
      const shipping = s.shipping_details as { name?: string; address?: { line1?: string; line2?: string; postal_code?: string; city?: string; country?: string } } | null;
      const shippingAddress = shipping?.address
        ? [shipping.address.line1, shipping.address.line2, `${shipping.address.postal_code} ${shipping.address.city}`, shipping.address.country]
            .filter(Boolean).join(', ')
        : '';

      const customerName  = shipping?.name || s.customer_details?.name || '';
      const customerEmail = s.customer_details?.email || '';
      const total         = (s.amount_total || 0) / 100;
      const shippingCost  = s.shipping_cost?.amount_total ? s.shipping_cost.amount_total / 100 : 0;
      const subtotal      = total - shippingCost;

      const { data: existing } = await supabaseAdmin
        .from('orders').select('*').eq('id', orderId).single();

      const orderLines = existing?.lines
        ? (typeof existing.lines === 'string' ? JSON.parse(existing.lines) : existing.lines)
        : [];

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

      // Stock decrement
      for (const line of orderLines) {
        if (line.product_id) {
          try { await supabaseAdmin.rpc('decrement_stock', { p_id: line.product_id, qty: line.qty }); } catch { /* non bloquant */ }
        }
      }

      // Invoice
      try {
        const { data: setting } = await supabaseAdmin
          .from('company_settings').select('value').eq('key', 'invoice_next').single();
        const invoiceNum = parseInt(setting?.value || '1', 10);
        const invoiceNumber = `F-${String(invoiceNum).padStart(4, '0')}`;
        await supabaseAdmin.from('invoices').insert({
          invoice_number: invoiceNumber, type: 'vente', order_id: orderId,
          customer_name: customerName, customer_email: customerEmail,
          date: new Date().toISOString().split('T')[0],
          due_date: new Date().toISOString().split('T')[0],
          status: 'paid', subtotal: subtotal > 0 ? subtotal : total,
          shipping: shippingCost, total, lines: JSON.stringify(orderLines),
        });
        await supabaseAdmin.from('company_settings')
          .update({ value: String(invoiceNum + 1) }).eq('key', 'invoice_next');
        await supabaseAdmin.from('orders')
          .update({ invoice_number: invoiceNumber }).eq('id', orderId);
      } catch { /* non bloquant */ }

      // Email
      try {
        const cfg = await getWlConfig();
        const siteName = cfg.site_name || '';
        const fromEmail = cfg.smtp_from || process.env.SMTP_FROM || `${siteName} <noreply@swedishcravings.fr>`;
        await sendEmail({
          from: fromEmail,
          to: customerEmail,
          subject: `✅ Commande ${existing?.order_number || ''} confirmée${siteName ? ` — ${siteName}` : ''}`,
          html: orderConfirmationHtml({ ...existing, customer_name: customerName, customer_email: customerEmail, shipping_address: shippingAddress, subtotal: subtotal > 0 ? subtotal : total, shipping: shippingCost, total, lines: orderLines }, cfg),
        });
      } catch { /* non bloquant */ }

      updated.push(`${existing?.order_number} (${customerName})`);
    } catch (e: unknown) {
      errors.push(`${orderId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return NextResponse.json({ updated, errors, total: updated.length });
}
