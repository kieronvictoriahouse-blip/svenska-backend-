import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';
import { createInvoiceFromOrder } from '@/lib/invoice-utils';
import { getWhiteLabelConfig, sendEmail, baseTemplate } from '@/lib/email-send';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const { data, error } = await supabaseAdmin.from('orders').select('*').eq('id', params.id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: CORS });
  return NextResponse.json({ order: data }, { headers: CORS });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401, headers: CORS });
  const body = await req.json();

  // Statut avant update
  const { data: before } = await supabaseAdmin.from('orders').select('*').eq('id', params.id).single();
  const prevStatus = before?.status;

  const { data, error } = await supabaseAdmin.from('orders')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', params.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const newStatus = data?.status;
  const triggerStatuses = ['shipped', 'delivered', 'confirmed'];

  // ── Déclencheurs au changement de statut ────────────────────────
  if (newStatus && newStatus !== prevStatus && triggerStatuses.includes(newStatus)) {
    const order = data;

    // 1. Créer la facture si elle n'existe pas encore
    let invoice: any = null;
    const { data: existingInv } = await supabaseAdmin
      .from('invoices').select('id, number').eq('order_id', params.id).maybeSingle();

    if (!existingInv) {
      invoice = await createInvoiceFromOrder({ ...order, status: newStatus });
    } else {
      invoice = existingInv;
    }

    // 2. Sync compta automatique (évite le clic manuel)
    const { data: existingEntry } = await supabaseAdmin
      .from('accounting_entries')
      .select('id').eq('reference_type', 'order').eq('reference_id', params.id).maybeSingle();

    if (!existingEntry) {
      const category = order.source === 'manual' ? 'vente_directe' : 'vente_en_ligne';
      try {
        await supabaseAdmin.from('accounting_entries').insert({
          date:             (order.created_at || new Date().toISOString()).split('T')[0],
          type:             'income',
          category,
          description:      `Commande ${order.order_number}${order.customer_name ? ' — ' + order.customer_name : ''}`,
          amount:           order.total || 0,
          reference_type:   'order',
          reference_id:     params.id,
          reference_number: order.order_number,
        });
      } catch { /* non bloquant */ }
    }

    // 3. Envoyer la facture par email si statut = shipped ou delivered
    if (['shipped', 'delivered'].includes(newStatus) && order.customer_email && invoice) {
      try {
        const cfg = await getWhiteLabelConfig();
        const siteName  = cfg.site_name || 'Swedish Cravings';
        const fromEmail = cfg.smtp_from || process.env.SMTP_FROM || `${siteName} <noreply@swedishcravings.fr>`;

        const lines: any[] = typeof order.lines === 'string' ? JSON.parse(order.lines) : (order.lines || []);
        const linesHtml = lines.map((l: any) =>
          `<div class="line"><span>${l.name || l.desc || '—'} × ${l.qty || 1}</span><span>${((l.qty || 1) * (l.price || 0)).toFixed(2)} €</span></div>`
        ).join('');

        const content = `
          <h1 class="title">${newStatus === 'shipped' ? '📦 Votre commande est en route !' : '✅ Commande livrée'}</h1>
          <p class="text">Bonjour ${order.customer_name},</p>
          <p class="text">${newStatus === 'shipped'
            ? 'Votre commande a été expédiée. Vous la recevrez dans les prochains jours.'
            : 'Votre commande a été livrée. Merci de votre confiance !'
          }</p>
          <div class="box">
            <div class="box-title">🧾 Facture ${invoice.number || invoice.invoice_number || ''}</div>
            ${linesHtml}
            <hr class="divider">
            <div class="line total"><span>Total TTC</span><span>${(order.total || 0).toFixed(2)} €</span></div>
          </div>
          <p class="text" style="font-size:13px">Votre facture est disponible dans votre espace client.</p>
          ${cfg.email ? `<p class="text" style="font-size:13px">Des questions ? <a href="mailto:${cfg.email}" style="color:#3E4550">${cfg.email}</a></p>` : ''}`;

        await sendEmail({
          from:    fromEmail,
          to:      order.customer_email,
          subject: `${newStatus === 'shipped' ? '📦 Expédition' : '✅ Livraison'} — ${order.order_number}${siteName ? ` | ${siteName}` : ''}`,
          html:    baseTemplate(content, `Commande ${order.order_number}`, cfg),
        }, cfg);
      } catch (emailErr) {
        console.error('[orders PUT] email error:', emailErr);
      }
    }
  }

  return NextResponse.json({ order: data });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401, headers: CORS });
  await supabaseAdmin.from('orders').update({ status: 'cancelled' }).eq('id', params.id);
  return NextResponse.json({ success: true });
}
