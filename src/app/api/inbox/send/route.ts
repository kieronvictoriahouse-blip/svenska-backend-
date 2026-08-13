import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';
import { appendToSent } from '@/lib/imap';
import { getWhiteLabelConfig } from '@/lib/email-send';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const DE = process.env.IMAP_USER || 'hej@swedishcravings.fr';

/* Signature reprise de l'identite des documents : Cormorant sur le nom,
   filet vert, comme les factures et les emails clients. */
function signature(cfg: Record<string, any>): string {
  const site = process.env.NEXT_PUBLIC_FRONT_URL || 'https://www.swedishcravings.fr';
  const logo = `${site.replace(/\/$/, '')}/emails/sc-monogramme.png`;
  const tel = cfg.phone ? ` · ${cfg.phone}` : '';
  /* Meme identite que les factures et les emails clients : monogramme,
     wordmark en Cormorant, filet vert. En tables et en styles inline —
     une signature traverse des clients de messagerie, pas un navigateur. */
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;border-top:1px solid #D8CFAF;padding-top:16px">
  <tr>
    <td valign="top" style="padding-right:16px">
      <img src="${logo}" width="42" height="63" alt="Swedish Cravings" style="display:block;width:42px;height:63px;border:0" />
    </td>
    <td valign="top" style="font-family:Arial,Helvetica,sans-serif">
      <div style="font-family:Georgia,'Times New Roman',serif;font-size:17px;letter-spacing:.16em;color:#44573D;text-transform:uppercase">Swedish Cravings</div>
      <div style="font-size:9px;letter-spacing:.28em;text-transform:uppercase;color:#A0977F;padding-top:4px">Bringing Sweden to your table</div>
      <div style="font-size:11.5px;line-height:1.75;color:#5F5A4E;padding-top:9px">
        <a href="mailto:${DE}" style="color:#5F5A4E;text-decoration:none">${DE}</a>${tel}<br />
        <a href="${site}" style="color:#44573D;text-decoration:none">${site.replace(/^https?:\/\//, '')}</a>
      </div>
      <div style="font-size:10px;color:#948B79;padding-top:8px">
        EI Victoria Vallet · SIREN 105 003 537 · TVA non applicable, art. 293 B du CGI
      </div>
    </td>
  </tr>
</table>`;
}

export async function POST(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const { to, cc, subject, html, inReplyTo, signer = true, attachments = [] } =
    await req.json().catch(() => ({}));

  /* Les pièces jointes arrivent en base64 depuis le navigateur. On borne
     la taille : au-delà, le message est refusé par la plupart des serveurs
     et l'échec arriverait après l'envoi, donc trop tard pour le dire. */
  const PJ_MAX = 8 * 1024 * 1024;
  const pieces = (Array.isArray(attachments) ? attachments : []).slice(0, 10).map((a: any) => ({
    filename: String(a.filename || 'piece-jointe'),
    content: Buffer.from(String(a.content || ''), 'base64'),
  }));
  const poids = pieces.reduce((s, p) => s + p.content.length, 0);
  if (poids > PJ_MAX) {
    return NextResponse.json({
      error: `Pièces jointes trop lourdes (${Math.round(poids / 1024 / 1024)} Mo) — 8 Mo maximum`,
    }, { status: 400 });
  }
  const destinataires = String(to || '').split(/[,;]/).map(s => s.trim()).filter(Boolean);
  if (!destinataires.length) return NextResponse.json({ error: 'Destinataire manquant' }, { status: 400 });
  if (!String(subject || '').trim()) return NextResponse.json({ error: 'Objet manquant' }, { status: 400 });

  const pass = process.env.IMAP_PASSWORD;
  if (!pass) return NextResponse.json({ error: 'IMAP_PASSWORD non configuré' }, { status: 500 });

  /* On envoie par le SMTP de la boîte, pas par Resend : le message doit
     partir de hej@ avec les bons en-têtes, et pouvoir être déposé tel
     quel dans les Envoyés. */
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.ionos.fr',
    port: Number(process.env.SMTP_PORT || 465),
    secure: true,
    auth: { user: DE, pass },
  });

  const cfg = await getWhiteLabelConfig();
  const corps = `${html || ''}${signer ? signature(cfg) : ''}`;

  try {
    /* On compose le message nous-memes : nodemailer ne rend pas la source
       brute apres envoi, or c'est exactement elle qu'il faut deposer dans
       les Envoyes pour que la copie soit fidele. */
    const MailComposer = (await import('nodemailer/lib/mail-composer')).default as any;
    const composeur = new MailComposer({
      from: `Swedish Cravings <${DE}>`,
      to: destinataires.join(', '),
      cc: cc || undefined,
      subject,
      html: corps,
      ...(pieces.length ? { attachments: pieces } : {}),
      ...(inReplyTo ? { inReplyTo, references: inReplyTo } : {}),
    });
    const brut: Buffer = await new Promise((res, rej) =>
      composeur.compile().build((err: any, msg: Buffer) => (err ? rej(err) : res(msg))));

    await transport.sendMail({
      envelope: { from: DE, to: destinataires.concat(cc ? [cc] : []) },
      raw: brut,
    });

    // Copie dans les Envoyés — non bloquant : le message est déjà parti.
    try { await appendToSent(brut); }
    catch (e) { console.error('[inbox/send] copie dans Envoyés impossible', e); }

    if (inReplyTo) {
      await supabaseAdmin.from('inbox_messages')
        .update({ answered: true }).eq('message_id', inReplyTo);
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Envoi impossible' }, { status: 500 });
  }
}
