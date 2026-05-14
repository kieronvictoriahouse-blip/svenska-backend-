import { supabaseAdmin } from '@/lib/supabase';

const RESEND_API_KEY = process.env.RESEND_API_KEY;

export type Attachment = { filename: string; content: Buffer | string };
export type SendOpts = {
  to: string; subject: string; html: string; from: string;
  attachments?: Attachment[];
  tags?: { name: string; value: string }[];
};

export async function getWhiteLabelConfig(): Promise<Record<string, string>> {
  try {
    const { data } = await supabaseAdmin.from('white_label_config').select('*').limit(1).maybeSingle();
    return (data as Record<string, string>) || {};
  } catch {
    return {} as Record<string, string>;
  }
}

export async function sendEmailSmtp(opts: SendOpts, cfg: Record<string, string>) {
  const nodemailer = await import('nodemailer');
  const port = parseInt(cfg.smtp_port) || 587;
  const transporter = nodemailer.default.createTransport({
    host: cfg.smtp_host,
    port,
    secure: port === 465,
    auth: { user: cfg.smtp_user, pass: cfg.smtp_pass },
    tls: { rejectUnauthorized: false },
  });
  const attachments = opts.attachments?.map(a => ({ filename: a.filename, content: a.content }));
  await transporter.sendMail({ from: opts.from, to: opts.to, subject: opts.subject, html: opts.html, attachments });
}

export async function sendEmailResend(opts: SendOpts) {
  const attachments = opts.attachments?.map(a => ({
    filename: a.filename,
    content: Buffer.isBuffer(a.content) ? a.content.toString('base64') : Buffer.from(a.content).toString('base64'),
  }));
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: opts.from, to: opts.to, subject: opts.subject, html: opts.html,
      ...(attachments?.length ? { attachments } : {}),
      ...(opts.tags?.length ? { tags: opts.tags } : {}),
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Resend error');
  return data; // { id: 'resend_email_id' }
}

export async function sendEmail(opts: SendOpts, cfg: Record<string, string>) {
  const hasSmtp = cfg.smtp_host && cfg.smtp_user && cfg.smtp_pass;
  if (hasSmtp) return sendEmailSmtp(opts, cfg);
  if (RESEND_API_KEY) return sendEmailResend(opts);
  throw new Error('Aucune config email. Allez dans Configuration → 📧 Email pour configurer SMTP.');
}

export function baseTemplate(content: string, title: string, cfg: Record<string, any>) {
  const siteName = cfg.site_name || 'Admin';
  const siteSlogan = cfg.site_slogan || '';
  const colorPrimary = cfg.color_primary || '#1C2028';
  const frontUrl = cfg.front_url || process.env.NEXT_PUBLIC_FRONT_URL || '';
  const contactEmail = cfg.email || '';
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${title}</title>
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
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <p class="logo">${siteName}</p>
    ${siteSlogan ? `<p class="logo-tag">${siteSlogan}</p>` : ''}
  </div>
  <div class="body">${content}</div>
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

export function abandonedCartTemplate(cart: any, step: number, cfg: Record<string, any>) {
  const frontUrl = cfg.front_url || process.env.NEXT_PUBLIC_FRONT_URL || '';
  const discount = step === 3 ? '<p class="text" style="background:#FEF3C7;padding:12px 16px;border-radius:6px;border-left:4px solid #F59E0B">🎟️ <strong>Offre exclusive :</strong> utilisez le code <strong>RETOUR10</strong> pour obtenir 10% de réduction !</p>' : '';
  const subject = step === 1 ? 'Vous avez oublié quelque chose… 🛒' : step === 2 ? 'Votre panier vous attend ! 🛒' : 'Dernière chance — 10% de réduction 🎟️';
  const items = (typeof cart.cart_data === 'string' ? JSON.parse(cart.cart_data || '[]') : cart.cart_data || []);
  const content = `
    <h1 class="title">${step === 1 ? 'Vous avez oublié quelque chose…' : step === 2 ? 'Votre panier vous attend !' : 'Dernière chance !'}</h1>
    <p class="text">Bonjour ${cart.customer_name || ''},</p>
    <p class="text">${step === 1 ? 'Vous avez laissé des produits dans votre panier. Ils vous attendent encore !' : step === 2 ? 'Votre sélection est toujours disponible. Ne laissez pas partir ces produits !' : "C'est votre dernière chance. Et on vous offre 10% de réduction !"}</p>
    <div class="box">
      <div class="box-title">🛒 Votre panier — ${(cart.cart_total || 0).toFixed(2)} €</div>
      ${items.map((i: any) => `<div class="line"><span>${i.name || i.desc}</span><span>${(i.price || 0).toFixed(2)} €</span></div>`).join('')}
    </div>
    ${discount}
    ${frontUrl ? `<div style="text-align:center"><a href="${frontUrl}" class="btn">Terminer ma commande →</a></div>` : ''}
    <p class="text" style="font-size:13px;color:#6A7280">Si vous ne souhaitez plus recevoir ces rappels, ignorez simplement cet email.</p>`;
  return { html: baseTemplate(content, subject, cfg), subject };
}

export function welcomeTemplate(order: any, auto: any, cfg: Record<string, any>) {
  const frontUrl = cfg.front_url || process.env.NEXT_PUBLIC_FRONT_URL || '';
  const subject = auto?.subject || `Bienvenue chez ${cfg.site_name || 'nous'} ! 🎉`;
  const content = auto?.custom_html || `
    <h1 class="title">Bienvenue parmi nous ! 🎉</h1>
    <p class="text">Bonjour ${order.customer_name || ''},</p>
    <p class="text">Merci pour votre première commande ! Nous sommes ravis de vous compter parmi nos clients.</p>
    <p class="text">Chez ${cfg.site_name || 'nous'}, nous sélectionnons avec soin des produits authentiques pour vous offrir la meilleure expérience.</p>
    ${frontUrl ? `<div style="text-align:center"><a href="${frontUrl}" class="btn">Découvrir la boutique →</a></div>` : ''}
    <p class="text">À très bientôt !</p>`;
  return { html: baseTemplate(content, subject, cfg), subject };
}

export function winBackTemplate(customer: { email: string; name: string }, auto: any, cfg: Record<string, any>) {
  const frontUrl = cfg.front_url || process.env.NEXT_PUBLIC_FRONT_URL || '';
  const subject = auto?.subject || 'On vous manque ? 💌';
  const content = auto?.custom_html || `
    <h1 class="title">Ça fait longtemps…</h1>
    <p class="text">Bonjour ${customer.name || ''},</p>
    <p class="text">Cela fait un moment que vous n'avez pas visité ${cfg.site_name || 'notre boutique'}. Nous espérons que vous allez bien !</p>
    <p class="text">Nous avons de nouvelles saveurs qui pourraient vous plaire. Venez découvrir nos dernières nouveautés !</p>
    ${frontUrl ? `<div style="text-align:center"><a href="${frontUrl}" class="btn">Retourner à la boutique →</a></div>` : ''}
    <p class="text" style="font-size:13px;color:#6A7280">Si vous ne souhaitez plus recevoir nos emails, ignorez simplement ce message.</p>`;
  return { html: baseTemplate(content, subject, cfg), subject };
}

export function postPurchaseTemplate(order: any, auto: any, cfg: Record<string, any>) {
  const frontUrl = cfg.front_url || process.env.NEXT_PUBLIC_FRONT_URL || '';
  const subject = auto?.subject || 'Comment s\'est passée votre commande ? ⭐';
  const content = auto?.custom_html || `
    <h1 class="title">Comment s'est passée votre commande ?</h1>
    <p class="text">Bonjour ${order.customer_name || ''},</p>
    <p class="text">Nous espérons que votre commande vous a plu et que tout s'est bien passé !</p>
    <p class="text">Votre avis compte beaucoup pour nous et aide les autres clients à faire leur choix.</p>
    ${frontUrl ? `<div style="text-align:center"><a href="${frontUrl}" class="btn">Laisser un avis →</a></div>` : ''}
    <p class="text">Merci encore de nous faire confiance !</p>`;
  return { html: baseTemplate(content, subject, cfg), subject };
}

export function promoTemplate(products: any[], cfg: Record<string, any>, opts?: { subject?: string; intro?: string }) {
  const frontUrl = cfg.front_url || process.env.NEXT_PUBLIC_FRONT_URL || '';
  const colorPrimary = cfg.color_primary || '#1C2028';
  const subject = opts?.subject || `Nos sélections du moment — ${cfg.site_name || ''}`;
  const intro = opts?.intro || 'Découvrez notre sélection de produits du moment :';

  const productBlocks = products.map(p => `
    <td align="center" valign="top" style="width:50%;padding:12px;">
      ${p.image_url ? `<img src="${p.image_url}" alt="${p.name}" width="180" style="border-radius:6px;object-fit:cover;height:180px;width:180px;display:block;margin:0 auto 10px;">` : ''}
      <p style="font-size:14px;font-weight:600;color:#1C2028;margin:0 0 4px;">${p.name}</p>
      ${p.description ? `<p style="font-size:12px;color:#6A7280;margin:0 0 8px;">${p.description.slice(0, 60)}${p.description.length > 60 ? '…' : ''}</p>` : ''}
      <p style="font-size:16px;font-weight:700;color:${colorPrimary};margin:0 0 10px;">${(p.price || 0).toFixed(2)} €</p>
      ${frontUrl ? `<a href="${frontUrl}" style="background:${colorPrimary};color:#fff;text-decoration:none;padding:8px 18px;border-radius:4px;font-size:12px;letter-spacing:1px;text-transform:uppercase;">Voir →</a>` : ''}
    </td>`).join('');

  // Group into rows of 2
  const imgOf = (p: any) => p.image_url || p.image || p.main_image || (Array.isArray(p.images) ? p.images[0] : null) || '';

  const rows: string[] = [];
  for (let i = 0; i < products.length; i += 2) {
    const pair = products.slice(i, i + 2);
    rows.push(`<tr>${pair.map(p => `
      <td align="center" valign="top" style="width:50%;padding:12px;">
        ${imgOf(p) ? `<img src="${imgOf(p)}" alt="${p.name}" width="180" style="border-radius:6px;object-fit:cover;height:180px;width:180px;display:block;margin:0 auto 10px;">` : ''}
        <p style="font-size:14px;font-weight:600;color:#1C2028;margin:0 0 4px;">${p.name || p.name_fr || ''}</p>
        ${(p.description || p.description_fr) ? `<p style="font-size:12px;color:#6A7280;margin:0 0 8px;">${((p.description || p.description_fr) || '').slice(0, 60)}…</p>` : ''}
        <p style="font-size:16px;font-weight:700;color:${colorPrimary};margin:0 0 10px;">${(p.price || 0).toFixed(2)} €</p>
        ${frontUrl ? `<a href="${frontUrl}" style="background:${colorPrimary};color:#fff;text-decoration:none;padding:8px 18px;border-radius:4px;font-size:12px;letter-spacing:1px;text-transform:uppercase;">Voir →</a>` : ''}
      </td>`).join('')}${pair.length === 1 ? '<td></td>' : ''}</tr>`);
  }

  const content = `
    <h1 class="title">Nos sélections du moment</h1>
    <p class="text">${intro}</p>
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:20px 0;">
      ${rows.join('')}
    </table>
    ${frontUrl ? `<div style="text-align:center;margin-top:24px;"><a href="${frontUrl}" class="btn">Voir toute la boutique →</a></div>` : ''}`;

  return { html: baseTemplate(content, subject, cfg), subject };
}
