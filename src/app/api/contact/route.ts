import { NextRequest, NextResponse } from 'next/server';
import { sendEmail, getWhiteLabelConfig } from '@/lib/email-send';

/* Formulaire de contact de la vitrine (contact.html).
   Il affichait « Merci » sans rien envoyer : chaque message était perdu.
   Le message part maintenant par email à l'adresse de la boutique
   (Configuration → email), avec le client en reply-to pour répondre
   directement depuis sa messagerie. Rien n'est stocké. */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const champ = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/* Garde-fou anti-rafale, par instance : imparfait en serverless, mais
   suffisant contre un robot qui boucle sur le formulaire. */
const recents = new Map<string, number[]>();
function tropDeMessages(ip: string): boolean {
  const now = Date.now();
  const liste = (recents.get(ip) || []).filter(t => now - t < 10 * 60_000);
  liste.push(now);
  recents.set(ip, liste);
  return liste.length > 5;
}

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'JSON invalide' }, { status: 400, headers: CORS }); }

  // Piège à robots : champ invisible rempli → on fait semblant d'accepter.
  if (champ(body.website, 200)) return NextResponse.json({ ok: true }, { headers: CORS });

  const prenom  = champ(body.prenom, 80);
  const nom     = champ(body.nom, 80);
  const email   = champ(body.email, 200).toLowerCase();
  const sujet   = champ(body.sujet, 120);
  const message = champ(body.message, 5000);

  if (!prenom || !email || !message) {
    return NextResponse.json({ error: 'Champs obligatoires manquants' }, { status: 400, headers: CORS });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return NextResponse.json({ error: 'Adresse email invalide' }, { status: 400, headers: CORS });
  }

  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'inconnu';
  if (tropDeMessages(ip)) {
    return NextResponse.json({ error: 'Trop de messages, réessayez plus tard' }, { status: 429, headers: CORS });
  }

  try {
    const cfg = await getWhiteLabelConfig();
    const to = cfg.email || cfg.smtp_user || process.env.SMTP_FROM || '';
    const from = cfg.smtp_from || process.env.SMTP_FROM || process.env.RESEND_FROM || '';
    if (!to || !from) throw new Error('email de la boutique non configuré');

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1F231C">
        <div style="font-size:10px;letter-spacing:2.6px;text-transform:uppercase;color:#B49256;font-weight:bold">Message du site</div>
        <p style="font-size:14px;line-height:22px;margin:14px 0">
          <strong>${esc(`${prenom} ${nom}`.trim())}</strong> — <a href="mailto:${esc(email)}">${esc(email)}</a><br>
          ${sujet ? `Sujet : ${esc(sujet)}` : ''}
        </p>
        <div style="background:#F4EEE1;padding:14px 16px;font-size:14px;line-height:22px;white-space:pre-wrap">${esc(message)}</div>
        <p style="font-size:11px;color:#948B79">Répondez directement à cet email pour écrire au client.</p>
      </div>`;

    await sendEmail({
      from,
      to,
      replyTo: email,
      subject: `Contact site${sujet ? ` — ${sujet}` : ''} — ${prenom}`,
      html,
    }, cfg);

    return NextResponse.json({ ok: true }, { headers: CORS });
  } catch (e: any) {
    console.error('[contact] envoi échoué:', e?.message || e);
    return NextResponse.json({ error: 'Envoi impossible' }, { status: 500, headers: CORS });
  }
}
