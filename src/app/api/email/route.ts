import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { getWhiteLabelConfig, sendEmail, baseTemplate, abandonedCartTemplate, avecDesinscription } from '@/lib/email-send';
import { desinscription } from '@/lib/relance-panier';
import { envoyerCampagne, norm } from '@/lib/campagne-envoi';

export const dynamic = 'force-dynamic';
// Une campagne part dans cette requête : on se donne le maximum, et on
// s'arrête de soi-même avant (cf. BUDGET_MS) pour reprendre au clic suivant.
export const maxDuration = 300;

/** Adresses auxquelles un test de campagne peut partir : celles de la boutique et de l'admin connecté. */
function adressesAdmin(cfg: Record<string, string>, user: any): string[] {
  const nue = (s?: string) => { const m = String(s || '').match(/<([^>]+)>/); return norm(m ? m[1] : s); };
  return Array.from(new Set([user?.email, cfg.email, cfg.smtp_user, cfg.smtp_from, process.env.IMAP_USER, process.env.SMTP_FROM]
    .map(nue).filter(e => e.includes('@'))));
}

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

// ── ROUTE HANDLERS ─────────────────────────────────────────

export async function POST(req: NextRequest) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const body = await req.json();
  const { type, smtp_override } = body;
  const dbCfg = await getWhiteLabelConfig();
  // Merge: form values passed by admin UI take priority over saved DB values (enables testing before saving)
  const cfg: Record<string, string> = { ...dbCfg };
  if (smtp_override) {
    for (const [k, v] of Object.entries(smtp_override as Record<string, string>)) {
      if (v) cfg[k] = v;
    }
  }
  const siteName = cfg.site_name || '';
  const fromEmail = cfg.smtp_from || process.env.SMTP_FROM || process.env.RESEND_FROM || '';

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
      const r = await envoyerCampagne({ campaign_id, custom_html, cfg, fromEmail });
      return NextResponse.json(r.body, { status: r.status });
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

    // 5. Test d'une campagne sur une adresse précise (sans envoyer aux clients)
    if (type === 'test_campaign') {
      const { html, subject: testSubject } = body;
      const to = norm(body.to);
      if (!to) return NextResponse.json({ error: 'Email de test requis' }, { status: 400 });
      if (!html) return NextResponse.json({ error: 'Contenu HTML requis' }, { status: 400 });
      /* Un test ne part qu'à la boutique ou à l'admin connecté : une
         faute de frappe ne doit pas envoyer un « [TEST] » à un client. */
      const permises = adressesAdmin(dbCfg, user);
      if (!permises.includes(to)) {
        return NextResponse.json({ error: `Le test ne part qu’à ton adresse ou à celle de la boutique : ${permises.join(', ') || 'aucune configurée'}` }, { status: 400 });
      }
      const d = desinscription(to, 'newsletter');
      await sendEmail({
        from: fromEmail,
        to,
        subject: `[TEST] ${testSubject || 'Aperçu campagne'}${siteName ? ` — ${siteName}` : ''}`,
        // Le test montre le pied de désinscription tel que les abonnés le recevront.
        html: avecDesinscription(html, d.url), headers: d.headers,
      }, cfg);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Type inconnu' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const cfg = await getWhiteLabelConfig();
  const fromEmail = (cfg as any).smtp_from || process.env.SMTP_FROM || '';
  return NextResponse.json({ configured: !!(cfg.smtp_host || process.env.RESEND_API_KEY), from: fromEmail });
}
