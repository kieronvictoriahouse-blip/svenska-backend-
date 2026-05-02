import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

const RESEND_API_KEY = process.env.RESEND_API_KEY;

async function getWhiteLabelConfig() {
  try {
    const { data } = await supabaseAdmin.from('white_label_config').select('*').limit(1).maybeSingle();
    return data || {};
  } catch {
    return {};
  }
}

// ── SEND VIA RESEND ────────────────────────────────────────
async function sendEmail({ to, subject, html, from }: { to: string; subject: string; html: string; from: string }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Resend error');
  return data;
}

// ── TEMPLATES EMAIL ────────────────────────────────────────
function baseTemplate(content: string, title: string, cfg: Record<string, any>) {
  const siteName = cfg.site_name || 'Admin';
  const siteSlogan = cfg.site_slogan || '';
  const colorPrimary = cfg.color_primary || '#1C2028';
  const frontUrl = cfg.front_url || process.env.NEXT_PUBLIC_FRONT_URL || '';
  const contactEmail = cfg.email || '';

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
  body { margin: 0; padding: 0; background: #EDEAE4; font-family: 'Georgia', serif; }
  .wrap { max-width: 600px; margin: 40px auto; background: #FDFAF5; border-radius: 8px; overflow: hidden; }
  .header { background: ${colorPrimary}; padding: 28px 40px; text-align: center; }
  .logo { color: #fff; font-size: 22px; font-weight: 300; letter-spacing: 2px; text-transform: uppercase; margin: 0; }
  .logo-tag { color: rgba(255,255,255,0.6); font-size: 10px; letter-spacing: 3px; text-transform: uppercase; margin-top: 4px; }
  .body { padding: 40px; }
  .title { font-size: 26px; color: #1C2028; font-weight: 300; margin-bottom: 16px; }
  .text { font-size: 15px; color: #3E4550; line-height: 1.8; margin-bottom: 16px; }
  .box { background: #F6F1E9; border-radius: 6px; padding: 20px 24px; margin: 24px 0; }
  .box-title { font-size: 11px; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase; color: ${colorPrimary}; margin-bottom: 12px; }
  .line { display: flex; justify-content: space-between; font-size: 14px; color: #1C2028; padding: 4px 0; border-bottom: 1px solid #D8CEBC; }
  .line:last-child { border-bottom: none; }
  .total { font-size: 16px; font-weight: 700; color: #1C2028; padding: 10px 0 0; }
  .btn { display: inline-block; background: ${colorPrimary}; color: #fff; text-decoration: none; padding: 14px 32px; border-radius: 4px; font-size: 13px; letter-spacing: 1px; text-transform: uppercase; margin: 20px 0; }
  .footer { background: #1C2028; padding: 24px 40px; text-align: center; }
  .footer-text { color: rgba(255,255,255,0.4); font-size: 11px; line-height: 1.8; }
  .footer-link { color: rgba(255,255,255,0.6); text-decoration: none; }
  .divider { border: none; border-top: 1px solid #D8CEBC; margin: 24px 0; }
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <p class="logo">${siteName}</p>
    ${siteSlogan ? `<p class="logo-tag">${siteSlogan}</p>` : ''}
  </div>
  <div class="body">
    ${content}
  </div>
  <div class="footer">
    <p class="footer-text">
      ${siteName}${frontUrl ? ` · <a href="${frontUrl}" class="footer-link">${frontUrl}</a>` : ''}<br>
      Vous recevez cet email car vous avez passé une commande sur notre site.${contactEmail ? `<br><a href="mailto:${contactEmail}" class="footer-link">${contactEmail}</a>` : ''}
    </p>
  </div>
</div>
</body>
</html>`;
}

function orderConfirmationTemplate(order: any, cfg: Record<string, any>) {
  const lines = (typeof order.lines === 'string' ? JSON.parse(order.lines) : order.lines || []);
  const linesHtml = lines.map((l: any) => `
    <div class="line">
      <span>${l.desc || l.name} × ${l.qty}</span>
      <span>${((l.qty * l.price) || 0).toFixed(2)} €</span>
    </div>`).join('');

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

    ${contactEmail ? `<p class="text">Des questions ? Répondez simplement à cet email ou contactez-nous à <a href="mailto:${contactEmail}" style="color:#3E4550">${contactEmail}</a></p>` : ''}
    <p class="text">Merci beaucoup ! 🎉</p>`;

  return baseTemplate(content, `Commande ${order.order_number} confirmée`, cfg);
}

function abandonedCartTemplate(cart: any, step: number, cfg: Record<string, any>) {
  const frontUrl = cfg.front_url || process.env.NEXT_PUBLIC_FRONT_URL || '';
  const discount = step === 3 ? '<p class="text" style="background:#FEF3C7;padding:12px 16px;border-radius:6px;border-left:4px solid #F59E0B">🎟️ <strong>Offre exclusive :</strong> utilisez le code <strong>RETOUR10</strong> pour obtenir 10% de réduction sur votre commande !</p>' : '';
  const subject = step === 1
    ? 'Vous avez oublié quelque chose… 🛒'
    : step === 2
    ? 'Votre panier vous attend ! 🛒'
    : 'Dernière chance — 10% de réduction 🎟️';

  const content = `
    <h1 class="title">${step === 1 ? 'Vous avez oublié quelque chose…' : step === 2 ? 'Votre panier vous attend !' : 'Dernière chance !'}</h1>
    <p class="text">Bonjour ${cart.customer_name || ''},</p>
    <p class="text">${
      step === 1
        ? 'Vous avez laissé des produits dans votre panier. Ils vous attendent encore !'
        : step === 2
        ? 'Votre sélection est toujours disponible. Ne laissez pas partir ces produits !'
        : 'C\'est votre dernière chance de récupérer votre panier. Et on vous offre 10% de réduction !'
    }</p>

    <div class="box">
      <div class="box-title">🛒 Votre panier — ${(cart.cart_total || 0).toFixed(2)} €</div>
      ${(typeof cart.cart_data === 'string' ? JSON.parse(cart.cart_data) : cart.cart_data || [])
        .map((item: any) => `<div class="line"><span>${item.name || item.desc}</span><span>${(item.price || 0).toFixed(2)} €</span></div>`).join('')}
    </div>

    ${discount}

    ${frontUrl ? `<div style="text-align:center"><a href="${frontUrl}" class="btn">Terminer ma commande →</a></div>` : ''}

    <p class="text" style="font-size:13px;color:#6A7280">Si vous ne souhaitez plus recevoir ces rappels, ignorez simplement cet email.</p>`;

  return { html: baseTemplate(content, subject, cfg), subject };
}

function campaignTemplate(campaign: any, cfg: Record<string, any>) {
  const frontUrl = cfg.front_url || process.env.NEXT_PUBLIC_FRONT_URL || '';
  const content = campaign.content || `
    <h1 class="title">${campaign.name}</h1>
    <p class="text">Découvrez nos nouveautés et offres exclusives.</p>
    ${frontUrl ? `<div style="text-align:center"><a href="${frontUrl}" class="btn">Voir la boutique →</a></div>` : ''}`;
  return baseTemplate(content, campaign.subject || campaign.name, cfg);
}

// ── ROUTES ─────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { type } = body;

  if (!RESEND_API_KEY) {
    return NextResponse.json({ error: 'RESEND_API_KEY non configurée' }, { status: 500 });
  }

  const cfg = await getWhiteLabelConfig();
  const siteName = (cfg as any).site_name || '';
  const fromEmail = (cfg as any).smtp_from || process.env.SMTP_FROM || (siteName ? `${siteName} <noreply@example.com>` : 'noreply@example.com');

  try {
    // 1. Confirmation de commande
    if (type === 'order_confirmation') {
      const { order } = body;
      if (!order?.customer_email) return NextResponse.json({ error: 'Email requis' }, { status: 400 });

      await sendEmail({
        from: fromEmail,
        to: order.customer_email,
        subject: `✅ Commande ${order.order_number} confirmée${siteName ? ` — ${siteName}` : ''}`,
        html: orderConfirmationTemplate(order, cfg),
      });

      return NextResponse.json({ success: true, message: 'Email de confirmation envoyé' });
    }

    // 2. Relance panier abandonné
    if (type === 'abandoned_cart') {
      const { cart_id, step } = body;
      const { data: cart } = await supabaseAdmin.from('abandoned_carts').select('*').eq('id', cart_id).single();
      if (!cart) return NextResponse.json({ error: 'Panier non trouvé' }, { status: 404 });

      const { html, subject } = abandonedCartTemplate(cart, step || 1, cfg);
      await sendEmail({ from: fromEmail, to: cart.customer_email, subject, html });

      const updateField = `email_${step || 1}_sent_at`;
      await supabaseAdmin.from('abandoned_carts').update({ [updateField]: new Date().toISOString() }).eq('id', cart_id);

      return NextResponse.json({ success: true, message: `Relance J+${step === 1 ? 1 : step === 2 ? 3 : 7} envoyée` });
    }

    // 3. Envoi de campagne
    if (type === 'campaign') {
      const { campaign_id } = body;
      const { data: campaign } = await supabaseAdmin.from('marketing_campaigns').select('*').eq('id', campaign_id).single();
      if (!campaign) return NextResponse.json({ error: 'Campagne non trouvée' }, { status: 404 });

      let emails: string[] = [];
      if (campaign.target_segment === 'all' || !campaign.target_segment) {
        const { data: contacts } = await supabaseAdmin.from('contacts').select('email').eq('type', 'client').not('email', 'is', null);
        emails = (contacts || []).map((c: any) => c.email).filter(Boolean);
      } else if (campaign.target_segment === 'new_customers') {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const { data: orders } = await supabaseAdmin.from('orders').select('customer_email').gte('created_at', thirtyDaysAgo);
        emails = Array.from(new Set((orders || []).map((o: any) => o.customer_email).filter(Boolean)));
      } else if (campaign.target_segment === 'abandoned_cart') {
        const { data: carts } = await supabaseAdmin.from('abandoned_carts').select('customer_email').eq('recovered', false);
        emails = Array.from(new Set((carts || []).map((c: any) => c.customer_email).filter(Boolean)));
      }

      if (emails.length === 0) return NextResponse.json({ error: 'Aucun destinataire trouvé' }, { status: 400 });

      let sent = 0;
      const html = campaignTemplate(campaign, cfg);
      for (const email of emails) {
        try {
          await sendEmail({ from: fromEmail, to: email, subject: campaign.subject || campaign.name, html });
          sent++;
          await new Promise(r => setTimeout(r, 100));
        } catch(e) {}
      }

      await supabaseAdmin.from('marketing_campaigns').update({
        status: 'active',
        started_at: new Date().toISOString(),
        sent_count: sent,
      }).eq('id', campaign_id);

      return NextResponse.json({ success: true, sent, total: emails.length });
    }

    // 4. Email test
    if (type === 'test') {
      const { to } = body;
      await sendEmail({
        from: fromEmail,
        to: to || (cfg as any).email || 'test@example.com',
        subject: `✅ Test email${siteName ? ` — ${siteName}` : ''}`,
        html: baseTemplate('<h1 class="title">Email de test</h1><p class="text">Votre configuration email fonctionne parfaitement !</p>', 'Test', cfg),
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Type inconnu' }, { status: 400 });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET() {
  const cfg = await getWhiteLabelConfig();
  const fromEmail = (cfg as any).smtp_from || process.env.SMTP_FROM || '';
  return NextResponse.json({
    configured: !!RESEND_API_KEY,
    from: fromEmail,
  });
}
