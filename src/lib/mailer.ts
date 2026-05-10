import { supabaseAdmin } from './supabase';

const RESEND_API_KEY = process.env.RESEND_API_KEY;

export async function getWlConfig(): Promise<Record<string, string>> {
  try {
    const { data } = await supabaseAdmin.from('white_label_config').select('*').limit(1).maybeSingle();
    return (data as Record<string, string>) || {};
  } catch { return {}; }
}

export async function sendEmail({ to, subject, html, from }: { to: string; subject: string; html: string; from: string }) {
  if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY non configurée');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, html }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Resend error');
  return data;
}

function baseTemplate(content: string, title: string, cfg: Record<string, string>) {
  const siteName     = cfg.site_name || '';
  const siteSlogan   = cfg.site_slogan || '';
  const colorPrimary = cfg.color_primary || '#1C2028';
  const frontUrl     = cfg.front_url || process.env.NEXT_PUBLIC_FRONT_URL || '';
  const contactEmail = cfg.email || '';

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
<title>${title}</title>
<style>
body{margin:0;padding:0;background:#EDEAE4;font-family:'Georgia',serif;}
.wrap{max-width:600px;margin:40px auto;background:#FDFAF5;border-radius:8px;overflow:hidden;}
.header{background:${colorPrimary};padding:28px 40px;text-align:center;}
.logo{color:#fff;font-size:22px;font-weight:300;letter-spacing:2px;text-transform:uppercase;margin:0;}
.logo-tag{color:rgba(255,255,255,0.6);font-size:10px;letter-spacing:3px;text-transform:uppercase;margin-top:4px;}
.body{padding:40px;}
.title{font-size:26px;color:#1C2028;font-weight:300;margin-bottom:16px;}
.text{font-size:15px;color:#3E4550;line-height:1.8;margin-bottom:16px;}
.box{background:#F6F1E9;border-radius:6px;padding:20px 24px;margin:24px 0;}
.box-title{font-size:11px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:${colorPrimary};margin-bottom:12px;}
.line{display:flex;justify-content:space-between;font-size:14px;color:#1C2028;padding:4px 0;border-bottom:1px solid #D8CEBC;}
.line:last-child{border-bottom:none;}
.total{font-size:16px;font-weight:700;color:#1C2028;padding:10px 0 0;}
.btn{display:inline-block;background:${colorPrimary};color:#fff;text-decoration:none;padding:14px 32px;border-radius:4px;font-size:13px;letter-spacing:1px;text-transform:uppercase;margin:20px 0;}
.footer{background:#1C2028;padding:24px 40px;text-align:center;}
.footer-text{color:rgba(255,255,255,0.4);font-size:11px;line-height:1.8;}
.footer-link{color:rgba(255,255,255,0.6);text-decoration:none;}
.divider{border:none;border-top:1px solid #D8CEBC;margin:24px 0;}
</style></head><body>
<div class="wrap">
  <div class="header">
    <p class="logo">${siteName}</p>
    ${siteSlogan ? `<p class="logo-tag">${siteSlogan}</p>` : ''}
  </div>
  <div class="body">${content}</div>
  <div class="footer">
    <p class="footer-text">
      ${siteName}${frontUrl ? ` · <a href="${frontUrl}" class="footer-link">${frontUrl}</a>` : ''}<br>
      ${contactEmail ? `<a href="mailto:${contactEmail}" class="footer-link">${contactEmail}</a>` : ''}
    </p>
  </div>
</div></body></html>`;
}

export function orderConfirmationHtml(order: Record<string, unknown>, cfg: Record<string, string>): string {
  const lines: Array<Record<string, unknown>> =
    typeof order.lines === 'string' ? JSON.parse(order.lines as string) : (order.lines as Array<Record<string, unknown>>) || [];

  const linesHtml = lines.map((l) =>
    `<div class="line"><span>${l.desc || l.name} × ${l.qty}</span><span>${(((l.qty as number) * (l.price as number)) || 0).toFixed(2)} €</span></div>`
  ).join('');

  const subtotal = (order.subtotal as number) || (order.total as number) || 0;
  const shipping = (order.shipping as number) || 0;
  const total    = (order.total as number) || 0;
  const contactEmail = cfg.email || '';
  const frontUrl = cfg.front_url || process.env.NEXT_PUBLIC_FRONT_URL || '';

  const content = `
    <h1 class="title">Merci pour votre commande !</h1>
    <p class="text">Bonjour ${order.customer_name},</p>
    <p class="text">Nous avons bien reçu votre commande et nous la préparons avec soin.</p>
    <div class="box">
      <div class="box-title">📦 Récapitulatif — ${order.order_number}</div>
      ${linesHtml}
      <hr class="divider">
      <div class="line"><span>Sous-total</span><span>${subtotal.toFixed(2)} €</span></div>
      <div class="line"><span>Livraison</span><span>${shipping > 0 ? shipping.toFixed(2) + ' €' : 'Offerte'}</span></div>
      <div class="line total"><span>Total TTC</span><span>${total.toFixed(2)} €</span></div>
    </div>
    <div class="box">
      <div class="box-title">📬 Livraison</div>
      <p style="font-size:14px;color:#1C2028;margin:0">${order.shipping_address || order.customer_address || 'Adresse non renseignée'}</p>
    </div>
    ${frontUrl ? `<div style="text-align:center"><a href="${frontUrl}/compte.html" class="btn">Suivre ma commande →</a></div>` : ''}
    ${contactEmail ? `<p class="text" style="font-size:13px">Des questions ? <a href="mailto:${contactEmail}" style="color:#3E4550">${contactEmail}</a></p>` : ''}`;

  return baseTemplate(content, `Commande ${order.order_number} confirmée`, cfg);
}
