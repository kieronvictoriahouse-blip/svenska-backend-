import { supabaseAdmin } from '@/lib/supabase';
import { fetchLogspherOrder } from '@/lib/logspher';

/* ═══════════════════════════════════════════════════════════════
   RATTRAPAGE D'UNE ÉTIQUETTE UGO DÉJÀ GÉNÉRÉE

   Quand /ship renvoie 402 (compte UGO sans crédit), UGO réserve l'envoi
   et donne un lien de paiement. Une fois le lien réglé, l'étiquette est
   générée CHEZ UGO — mais la commande ne le sait pas : pas de suivi, pas
   de PDF, donc aucun email de suivi, et le cron livraisons l'ignore.

   On relit alors l'envoi par notre numéro de commande
   (GET /api/order/reference) et on remplit la commande. Si elle est déjà
   « expédiée », le client n'a reçu qu'un email sans suivi : on lui envoie
   l'email d'expédition avec le vrai numéro.

   Utilisé par le bouton « Relancer l'étiquette UGO » et par le cron
   quotidien /api/cron/livraisons.
   ═══════════════════════════════════════════════════════════════ */

export type AttachResult =
  | { attached: false; reason: string }
  | { attached: true; tracking_number: string; label_url: string; emailed: boolean; patch: Record<string, any> };

export async function attachExistingLogspherLabel(order: any, opts: { sendEmail?: boolean } = {}): Promise<AttachResult> {
  if (!order?.order_number) return { attached: false, reason: 'sans numéro de commande' };
  if (order.logspher_label_url && (order.logspher_tracking || order.tracking_number)) {
    return { attached: false, reason: 'déjà rattachée' };
  }

  const found = await fetchLogspherOrder(order.order_number);
  if (!found) return { attached: false, reason: 'aucun envoi généré chez UGO' };

  const patch: Record<string, any> = {
    logspher_shipment_id:  found.shipment_id || null,
    logspher_label_url:    found.label_url || null,
    logspher_carrier_name: found.carrier_name || null,
    logspher_carrier_code: found.carrier_code || null,
    logspher_error:        null,
    updated_at:            new Date().toISOString(),
  };
  if (found.tracking_number) {
    patch.logspher_tracking = found.tracking_number;
    // Ne pas écraser un suivi saisi à la main pour un autre transporteur.
    if (!order.tracking_number) patch.tracking_number = found.tracking_number;
  }

  const { error } = await supabaseAdmin.from('orders').update(patch).eq('id', order.id);
  if (error) throw new Error(`Mise à jour commande ${order.order_number} : ${error.message}`);

  /* Email de suivi : seulement si la commande est déjà partie (le client a
     reçu un « expédié » sans numéro) et qu'on a un vrai suivi. Pour une
     commande pas encore expédiée, l'email partira au passage en
     « expédiée », avec ce suivi désormais présent. */
  let emailed = false;
  const tracking = found.tracking_number;
  if (opts.sendEmail !== false && tracking && order.customer_email
      && ['shipped', 'partial'].includes(order.status)) {
    try {
      const { expeditionEmail } = await import('@/lib/customer-emails');
      const { getWhiteLabelConfig, sendEmail } = await import('@/lib/email-send');
      const cfg = await getWhiteLabelConfig();
      const from = (cfg.email_from as string) || (cfg as any).smtp_from || '';
      const mail = await expeditionEmail({ ...order, ...patch, tracking_number: tracking });
      await sendEmail({ from, to: order.customer_email, subject: mail.sujet, html: mail.html }, cfg);
      emailed = true;
    } catch (e: any) {
      console.error(`[logspher-sync] email ${order.order_number} :`, e?.message || e);
    }
  }

  return { attached: true, tracking_number: tracking, label_url: found.label_url, emailed, patch };
}
