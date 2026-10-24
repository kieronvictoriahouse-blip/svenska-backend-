import { supabaseAdmin } from '@/lib/supabase';
import { getWhiteLabelConfig, sendEmail } from '@/lib/email-send';
import { livraisonEmail } from '@/lib/customer-emails';

/* ═══════════════════════════════════════════════════════════════
   EMAIL DE LIVRAISON + DEMANDE D'AVIS GOOGLE

   Deux déclencheurs passent une commande à « livrée » : le bouton de la
   fiche commande et le cron de suivi transporteur. Les deux appellent
   ceci, et le client ne reçoit l'email qu'UNE fois.

   La prise se fait sur `review_email_sent_at`, la colonne de
   l'automation « avis après achat » (cron marketing) : cet email porte
   déjà la demande d'avis, le client n'en reçoit pas une seconde.

   Le lien vient des réglages (company_settings.google_review_url). Une
   adresse opposée aux emails (désinscription, plainte) reçoit l'avis de
   livraison — c'est le suivi de sa commande — mais sans la sollicitation.
   ═══════════════════════════════════════════════════════════════ */

const norm = (e: unknown) => String(e || '').trim().toLowerCase();

async function lienAvisGoogle(email: string): Promise<string> {
  try {
    const [{ data: reglage }, { data: oppose }] = await Promise.all([
      supabaseAdmin.from('company_settings').select('value').eq('key', 'google_review_url').maybeSingle(),
      supabaseAdmin.from('email_optouts').select('email').eq('email', norm(email)).maybeSingle(),
    ]);
    if (oppose) return '';
    const v = String(reglage?.value || '').trim();
    // Le lien part tel quel dans un href : https uniquement, sans guillemet ni espace.
    return /^https:\/\/[^\s"<>]+$/.test(v) ? v : '';
  } catch {
    return '';   // un email sans bloc d'avis part quand même
  }
}

/** 'envoye', ou 'deja' si un passage précédent s'en est chargé. Lève si l'envoi échoue. */
export async function envoyerEmailLivraison(order: any): Promise<'envoye' | 'deja' | 'sans_email'> {
  if (!order?.id || !order?.customer_email) return 'sans_email';

  const marque = new Date().toISOString();
  const { data: pris, error } = await supabaseAdmin.from('orders')
    .update({ review_email_sent_at: marque })
    .eq('id', order.id).is('review_email_sent_at', null).select('id');
  /* Une erreur (colonne absente sur une ancienne base) ne bloque pas
     l'envoi : le changement de statut reste le garde-fou. */
  if (!error && !pris?.length) return 'deja';

  try {
    const cfg = await getWhiteLabelConfig();
    const from = cfg.smtp_from || process.env.SMTP_FROM || process.env.RESEND_FROM || '';
    const mail = await livraisonEmail(order, { lienAvis: await lienAvisGoogle(order.customer_email) });
    await sendEmail({ from, to: order.customer_email, subject: mail.sujet, html: mail.html }, cfg);
    return 'envoye';
  } catch (e) {
    // Échec : on rend la commande — la repasser en « livrée » renverra l'email.
    if (!error) {
      await supabaseAdmin.from('orders').update({ review_email_sent_at: null })
        .eq('id', order.id).eq('review_email_sent_at', marque);
    }
    throw e;
  }
}
