import nodemailer from 'nodemailer';
import { appendToSent, appendToDrafts } from '@/lib/imap';
import { getWhiteLabelConfig } from '@/lib/email-send';

/* ═══════════════════════════════════════════════════════════════
   ENVOI DEPUIS LA BOÎTE DU MARCHAND

   Un seul endroit qui compose et expédie : la rédaction, les envois
   programmés et les brouillons doivent produire exactement le même
   message, signature comprise.

   L'envoi passe par le SMTP de la boîte et non par Resend : le message
   doit partir de la boîte du marchand avec les bons en-têtes, et sa source brute doit
   pouvoir être déposée telle quelle dans les Envoyés.
   ═══════════════════════════════════════════════════════════════ */

export const DE = process.env.IMAP_USER || '';

/** Plafond de pièces jointes. Au-delà, la plupart des serveurs rejettent. */
export const PJ_MAX = 8 * 1024 * 1024;

export type PieceJointe = { filename: string; content: string };
export type Message = {
  to: string; cc?: string; subject: string; html?: string;
  inReplyTo?: string; attachments?: PieceJointe[]; signer?: boolean;
};

/** L'identité du marchand, depuis sa config — jamais de constante. */
function marqueDe(cfg: Record<string, any>) {
  const siren = String(cfg.siret || '').replace(/\D/g, '').slice(0, 9)
    .replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3');
  return {
    nom: cfg.site_name || '',
    slogan: cfg.site_slogan || '',
    legal: cfg.legal_name || '',
    siren,
  };
}

export function signature(cfg: Record<string, any>): string {
  const marque = marqueDe(cfg);
  const site = process.env.NEXT_PUBLIC_FRONT_URL || '';
  const logo = `${site.replace(/\/$/, '')}/emails/sc-monogramme.png`;
  const tel = cfg.phone ? ` · ${cfg.phone}` : '';
  /* Même identité que les factures et les emails clients : monogramme,
     wordmark en Cormorant, filet vert. En tables et styles inline — une
     signature traverse des clients de messagerie, pas un navigateur. */
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;border-top:1px solid #D8CFAF;padding-top:16px">
  <tr>
    <td valign="top" style="padding-right:16px">
      <img src="${logo}" width="42" height="63" alt="${marque.nom}" style="display:block;width:42px;height:63px;border:0" />
    </td>
    <td valign="top" style="font-family:Arial,Helvetica,sans-serif">
      <div style="font-family:Georgia,'Times New Roman',serif;font-size:17px;letter-spacing:.16em;color:#44573D;text-transform:uppercase">${marque.nom}</div>
      ${marque.slogan ? `<div style="font-size:9px;letter-spacing:.28em;text-transform:uppercase;color:#A0977F;padding-top:4px">${marque.slogan}</div>` : ''}
      <div style="font-size:11.5px;line-height:1.75;color:#5F5A4E;padding-top:9px">
        <a href="mailto:${DE}" style="color:#5F5A4E;text-decoration:none">${DE}</a>${tel}<br />
        <a href="${site}" style="color:#44573D;text-decoration:none">${site.replace(/^https?:\/\//, '')}</a>
      </div>
      <div style="font-size:10px;color:#948B79;padding-top:8px">
        ${[marque.legal, marque.siren ? 'SIREN ' + marque.siren : '', 'TVA non applicable, art. 293 B du CGI'].filter(Boolean).join(' · ')}
      </div>
    </td>
  </tr>
</table>`;
}

/** Décode les pièces jointes et vérifie le poids total. */
export function decoderPJ(attachments?: PieceJointe[]) {
  const pieces = (Array.isArray(attachments) ? attachments : []).slice(0, 10).map(a => ({
    filename: String(a.filename || 'piece-jointe'),
    content: Buffer.from(String(a.content || ''), 'base64'),
  }));
  const poids = pieces.reduce((s, p) => s + p.content.length, 0);
  return { pieces, poids };
}

/** Construit la source brute du message — c'est elle qu'on envoie ET qu'on archive. */
export async function composer(m: Message): Promise<Buffer> {
  const cfg = await getWhiteLabelConfig();
  const marque = marqueDe(cfg);
  const { pieces } = decoderPJ(m.attachments);
  const corps = `${m.html || ''}${m.signer === false ? '' : signature(cfg)}`;

  const MailComposer = (await import('nodemailer/lib/mail-composer')).default as any;
  const composeur = new MailComposer({
    from: `${marque.nom} <${DE}>`,
    to: m.to,
    cc: m.cc || undefined,
    subject: m.subject,
    html: corps,
    ...(pieces.length ? { attachments: pieces } : {}),
    ...(m.inReplyTo ? { inReplyTo: m.inReplyTo, references: m.inReplyTo } : {}),
  });
  return new Promise((res, rej) =>
    composeur.compile().build((err: any, msg: Buffer) => (err ? rej(err) : res(msg))));
}

function transport() {
  const pass = process.env.IMAP_PASSWORD;
  if (!pass) throw new Error('IMAP_PASSWORD non configuré — impossible d’envoyer');
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.ionos.fr',
    port: Number(process.env.SMTP_PORT || 465),
    secure: true,
    auth: { user: DE, pass },
  });
}

/**
 * Envoie le message et en dépose une copie dans les Envoyés.
 *
 * La copie est non bloquante : le message est déjà parti quand elle
 * échoue, remonter une erreur ferait croire à un envoi raté.
 */
export async function envoyer(m: Message): Promise<{ destinataires: string[]; avertissement?: string }> {
  const destinataires = String(m.to || '').split(/[,;]/).map(s => s.trim()).filter(Boolean);
  if (!destinataires.length) throw new Error('Destinataire manquant');
  if (!String(m.subject || '').trim()) throw new Error('Objet manquant');

  const { poids } = decoderPJ(m.attachments);
  if (poids > PJ_MAX) {
    throw new Error(`Pièces jointes trop lourdes (${Math.round(poids / 1024 / 1024)} Mo) — 8 Mo maximum`);
  }

  const brut = await composer(m);
  const cc = String(m.cc || '').split(/[,;]/).map(s => s.trim()).filter(Boolean);

  await transport().sendMail({
    envelope: { from: DE, to: destinataires.concat(cc) },
    raw: brut,
  });

  /* La copie ne doit pas faire echouer l'envoi — le message est deja
     parti. Mais elle ne doit pas non plus disparaitre dans les logs :
     un message absent des Envoyes se remarque trop tard. */
  let avertissement: string | undefined;
  try {
    await appendToSent(brut);
  } catch (e: any) {
    avertissement = `Message envoyé, mais la copie dans « Envoyés » a échoué : ${e?.message || 'erreur IMAP'}`;
    console.error('[mail-send]', avertissement);
  }

  return { destinataires, avertissement };
}

/** Dépose un brouillon sur le serveur et retourne son UID. */
export async function deposerBrouillon(m: Message): Promise<{ uid: number | null; folder: string }> {
  const brut = await composer({ ...m, signer: false });   // la signature s'ajoute à l'envoi
  return appendToDrafts(brut);
}

/* ═══════════════════════════════════════════════════════════════
   FILE DES ENVOIS PROGRAMMÉS

   Le plan Vercel ne laisse tourner qu'un cron par jour : s'y fier
   seulement voudrait dire qu'un message programmé pour 14 h part le
   lendemain matin. La file est donc vidée aussi à chaque relève de la
   boîte, et le cron n'est plus qu'un filet.

   La prise exclusive (pending → sending) rend l'opération sûre même si
   les deux se déclenchent en même temps.
   ═══════════════════════════════════════════════════════════════ */
export async function viderFileProgrammee(limite = 25): Promise<{
  envoyes: number; echecs: Array<{ id: string; erreur: string }>;
}> {
  const { supabaseAdmin } = await import('@/lib/supabase');

  const { data: dus } = await supabaseAdmin
    .from('scheduled_emails').select('*')
    .eq('status', 'pending').lte('send_at', new Date().toISOString())
    .order('send_at').limit(limite);

  let envoyes = 0;
  const echecs: Array<{ id: string; erreur: string }> = [];

  for (const m of dus || []) {
    const { data: pris } = await supabaseAdmin.from('scheduled_emails')
      .update({ status: 'sending', attempts: (m.attempts || 0) + 1 })
      .eq('id', m.id).eq('status', 'pending').select();
    if (!pris?.length) continue;          // déjà pris par une autre exécution

    try {
      await envoyer({
        to: m.to_emails, cc: m.cc_emails || undefined, subject: m.subject,
        html: m.body || '', inReplyTo: m.in_reply_to || undefined,
        attachments: m.attachments || [],
      });
      await supabaseAdmin.from('scheduled_emails')
        .update({ status: 'sent', sent_at: new Date().toISOString(), last_error: null })
        .eq('id', m.id);
      envoyes++;
    } catch (e: any) {
      const erreur = e?.message || 'Envoi impossible';
      // Trois tentatives puis abandon : insister sur une adresse
      // invalide ne fait que répéter le même échec.
      const fini = (m.attempts || 0) + 1 >= 3;
      await supabaseAdmin.from('scheduled_emails')
        .update({ status: fini ? 'failed' : 'pending', last_error: erreur })
        .eq('id', m.id);
      echecs.push({ id: m.id, erreur });
    }
  }

  return { envoyes, echecs };
}
