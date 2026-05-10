import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getWhiteLabelConfig, sendEmail, baseTemplate, abandonedCartTemplate } from '@/lib/email-send';

// ── TEMPLATES SPÉCIFIQUES À CE ROUTE ──────────────────────

function orderConfirmationTemplate(order: any, cfg: Record<string, any>) {
  const lines = (typeof order.lines === 'string' ? JSON.parse(order.lines) : order.lines || []);
  const linesHtml = lines.map((l: any) => `
    <div class="line"><span>${l.desc || l.name} × ${l.qty}</span><span>${((l.qty * l.price) || 0).toFixed(2)} €</span></div>`).join('');
  const contactEmail = cfg.email || '';
  const content = `
    <h1 class="title">Merci pour votre commande !</h1>
    <p class="text">Bonjour ${order.customer_name},</p>
    <p class="text">Nous avons bien reçu votre commande et nous la préparons avec soin. Vous recevrez un email dès qu'elle sera expédiée.</p>
    <div class="box">
      <div class="box-title">📦 Récapitulatif — ${order.order_number}</div>
      ${linesHtml}
      <hr class="divider">
      <div class="line"><span>Sous-total HT</span><span>${(order.subtotal || 0).toFixed(2)} €</span></div>
      <div class="line"><span>Livraison</span><span>${order.shipping > 0 ? order.shipping.toFixed(2) + ' €' : 'Offerte'}</span></div>
      <div class="line total"><span>Total TTC</span><span>${(order.total || 0).toFixed(2)} €</span></div>
    </div>
    <div class="box">
      <div class="box-title">📬 Livraison</div>
      <p style="font-size:14px;color:#1C2028;margin:0">${order.customer_address || 'Adresse non renseignée'}</p>
    </div>
    ${contactEmail ? `<p class="text">Des questions ? <a href="mailto:${contactEmail}" style="color:#3E4550">${contactEmail}</a></p>` : ''}
    <p class="text">Merci beaucoup ! 🎉</p>`;
  return baseTemplate(content, `Commande ${order.order_number} confirmée`, cfg);
}

function campaignTemplate(campaign: any, cfg: Record<string, any>) {
  const frontUrl = cfg.front_url || process.env.NEXT_PUBLIC_FRONT_URL || '';
  const content = campaign.content || `
    <h1 class="title">${campaign.name}</h1>
    <p class="text">Découvrez nos nouveautés et offres exclusives.</p>
    ${frontUrl ? `<div style="text-align:center"><a href="${frontUrl}" class="btn">Voir la boutique →</a></div>` : ''}`;
  return baseTemplate(content, campaign.subject || campaign.name, cfg);
}

// ── ROUTE HANDLERS ─────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { type } = body;
  const cfg = await getWhiteLabelConfig();
  const siteName = cfg.site_name || '';
  const fromEmail = cfg.smtp_from || process.env.SMTP_FROM || (siteName ? `${siteName} <noreply@example.com>` : 'noreply@example.com');

  try {
    // 1. Confirmation de commande
    if (type === 'order_confirmation') {
      const { order } = body;
      if (!order?.customer_email) return NextResponse.json({ error: 'Email requis' }, { status: 400 });
      await sendEmail({
        from: fromEmail, to: order.customer_email,
        subject: `✅ Commande ${order.order_number} confirmée${siteName ? ` — ${siteName}` : ''}`,
        html: orderConfirmationTemplate(order, cfg),
      }, cfg);
      return NextResponse.json({ success: true });
    }

    // 2. Relance panier abandonné
    if (type === 'abandoned_cart') {
      const { cart_id, step } = body;
      const { data: cart } = await supabaseAdmin.from('abandoned_carts').select('*').eq('id', cart_id).single();
      if (!cart) return NextResponse.json({ error: 'Panier non trouvé' }, { status: 404 });
      const { html, subject } = abandonedCartTemplate(cart, step || 1, cfg);
      await sendEmail({ from: fromEmail, to: cart.customer_email, subject, html }, cfg);
      const updateField = `email_${step || 1}_sent_at`;
      await supabaseAdmin.from('abandoned_carts').update({ [updateField]: new Date().toISOString() }).eq('id', cart_id);
      return NextResponse.json({ success: true, message: `Relance J+${step === 1 ? 1 : step === 2 ? 3 : 7} envoyée` });
    }

    // 3. Envoi de campagne
    if (type === 'campaign') {
      const { campaign_id, custom_html } = body;
      const { data: campaign } = await supabaseAdmin.from('marketing_campaigns').select('*').eq('id', campaign_id).single();
      if (!campaign) return NextResponse.json({ error: 'Campagne non trouvée' }, { status: 404 });

      let emails: string[] = [];
      if (campaign.target_segment === 'all' || !campaign.target_segment) {
        const { data: orders } = await supabaseAdmin.from('orders').select('customer_email').not('customer_email', 'is', null);
        emails = Array.from(new Set((orders || []).map((o: any) => o.customer_email).filter(Boolean)));
      } else if (campaign.target_segment === 'new_customers') {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const { data: orders } = await supabaseAdmin.from('orders').select('customer_email').gte('created_at', thirtyDaysAgo);
        emails = Array.from(new Set((orders || []).map((o: any) => o.customer_email).filter(Boolean)));
      } else if (campaign.target_segment === 'abandoned_cart') {
        const { data: carts } = await supabaseAdmin.from('abandoned_carts').select('customer_email').eq('recovered', false);
        emails = Array.from(new Set((carts || []).map((c: any) => c.customer_email).filter(Boolean)));
      }

      if (emails.length === 0) return NextResponse.json({ error: 'Aucun destinataire trouvé' }, { status: 400 });

      let contentHtml = custom_html;
      if (!contentHtml) {
        const rawContent = campaign.content || '';
        try {
          const parsed = JSON.parse(rawContent);
          contentHtml = parsed.html || campaignTemplate(campaign, cfg);
        } catch {
          contentHtml = rawContent || campaignTemplate(campaign, cfg);
        }
      }

      let sent = 0;
      for (const email of emails) {
        try {
          await sendEmail({ from: fromEmail, to: email, subject: campaign.subject || campaign.name, html: contentHtml }, cfg);
          sent++;
          await new Promise(r => setTimeout(r, 150));
        } catch { /* skip */ }
      }

      await supabaseAdmin.from('marketing_campaigns').update({ status: 'active', sent_count: sent }).eq('id', campaign_id);
      return NextResponse.json({ success: true, sent, total: emails.length });
    }

    // 4. Email test
    if (type === 'test') {
      const { to } = body;
      await sendEmail({
        from: fromEmail,
        to: to || cfg.email || fromEmail,
        subject: `✅ Test email${siteName ? ` — ${siteName}` : ''}`,
        html: baseTemplate('<h1 class="title">Email de test ✅</h1><p class="text">Votre configuration email fonctionne parfaitement !</p>', 'Test email', cfg),
      }, cfg);
      return NextResponse.json({ success: true, method: (cfg.smtp_host && cfg.smtp_pass) ? 'smtp' : 'resend' });
    }

    return NextResponse.json({ error: 'Type inconnu' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET() {
  const cfg = await getWhiteLabelConfig();
  const fromEmail = (cfg as any).smtp_from || process.env.SMTP_FROM || '';
  return NextResponse.json({ configured: !!(cfg.smtp_host || process.env.RESEND_API_KEY), from: fromEmail });
}
