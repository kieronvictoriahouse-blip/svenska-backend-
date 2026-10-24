import Stripe from 'stripe';
import { supabaseAdmin } from '@/lib/supabase';
import { getWlConfig } from '@/lib/mailer';
import { confirmationCommande } from '@/lib/customer-emails';
import { sendEmail } from '@/lib/email-send';
import { secretServeur } from '@/lib/secret-interne';

/* ═══════════════════════════════════════════════════════════════
   SESSION STRIPE PAYÉE — tout ce qui suit un paiement

   Prise du statut « paid » (garde d'idempotence), usage du code promo,
   panier relancé marqué récupéré, brouillons doublons annulés, facture,
   écritures comptables, fidélité, emails client et marchand, étiquette
   relais, email de facture.

   Sorti tel quel du webhook (/api/webhook/stripe) pour que le rattrapage
   (/api/admin/reconcile-orders) passe par le MÊME chemin : il passait la
   commande en « payée » de son côté, sans facture, sans compta, sans
   email, sans usage du code promo ni fidélité.
   ═══════════════════════════════════════════════════════════════ */

/* Usage d'un code promo, compté au paiement (et plus à l'ouverture de la
   session Stripe, où chaque panier abandonné consommait un usage).
   Appelé derrière la prise du statut « paid » : une seule fois par
   commande, même si Stripe rejoue l'événement. Le compteur est relu et
   réécrit sous condition, pour qu'un paiement simultané avec le même
   code ne fasse pas perdre un usage. */
async function compterUsagePromo(promoId: string, email: string) {
  let unUsageParClient = false;
  for (let essai = 0; essai < 3; essai++) {
    const { data: p } = await supabaseAdmin
      .from('promo_codes').select('used_count, single_use_per_customer').eq('id', promoId).maybeSingle();
    if (!p) return;
    unUsageParClient = !!p.single_use_per_customer;
    const avant = p.used_count;
    let maj = supabaseAdmin.from('promo_codes').update({ used_count: (Number(avant) || 0) + 1 }).eq('id', promoId);
    maj = avant == null ? maj.is('used_count', null) : maj.eq('used_count', avant);
    const { data: fait, error } = await maj.select('id');
    if (error) throw error;
    if (fait?.length) break;
  }
  const e = String(email || '').trim().toLowerCase();
  if (unUsageParClient && e) {
    const { error } = await supabaseAdmin.from('promo_code_usages').upsert(
      { promo_code_id: promoId, customer_email: e },
      { onConflict: 'promo_code_id,customer_email', ignoreDuplicates: true },
    );
    if (error) throw error;
  }
}

/* Jour de l'écriture à PARIS : le serveur tourne en UTC, et un paiement
   du 1er janvier entre minuit et 1 h (2 h l'été) était comptabilisé la
   veille, dans l'exercice clos. */
const jourParis = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });

export async function traiterSessionPayee(
  session: any,
  { stripe, isTestEvent, eventId }: { stripe: Stripe; isTestEvent: boolean; eventId?: string },
): Promise<{ status: number; body: Record<string, unknown> }> {

  const fmtAddr = (a?: { line1?: string; line2?: string; postal_code?: string; city?: string; country?: string } | null) =>
    a ? [a.line1, a.line2, `${a.postal_code || ''} ${a.city || ''}`.trim(), a.country].filter(Boolean).join(', ') : '';

  /* Depuis l'API 2025-03-31, l'adresse de livraison est sous
     collected_information ; l'ancien champ est gardé en repli. */
  const shipping        = (session.collected_information?.shipping_details || session.shipping_details) as { name?: string; address?: { line1?: string; line2?: string; postal_code?: string; city?: string; country?: string } } | null;
  const shippingAddress = fmtAddr(shipping?.address);
  const billingAddress  = fmtAddr(session.customer_details?.address);

  const customerName  = shipping?.name || session.customer_details?.name || '';
  const customerEmail = session.customer_details?.email || '';
  const customerPhone = session.customer_details?.phone || '';
  const total         = (session.amount_total || 0) / 100;
  const shippingCost  = session.shipping_cost?.amount_total ? session.shipping_cost.amount_total / 100 : 0;

  const orderId = session.metadata?.order_id;

  const { data: existing } = orderId
    ? await supabaseAdmin.from('orders').select('*').eq('id', orderId).maybeSingle()
    : { data: null as any };

  if (orderId && existing) {
    // Commande draft créée au checkout → mettre à jour
    const orderLines = existing?.lines
      ? (typeof existing.lines === 'string' ? JSON.parse(existing.lines) : existing.lines)
      : [];

    const subtotal = total - shippingCost;

    // Adresse effective : livraison Stripe → point relais → facturation.
    // Garantit une adresse sur la commande/facture/email même en relais/retrait.
    const relayAddress = existing?.relay_point_address
      ? ['Point relais', existing.relay_point_name, '—', existing.relay_point_address].filter(Boolean).join(' ')
      : '';
    const effectiveAddress = shippingAddress || relayAddress || billingAddress;

    // 1) Mise à jour ESSENTIELLE — uniquement des colonnes garanties + statut payé.
    //    Ne doit jamais échouer : c'est ce qui rend la commande visible/payée.
    /* C'est aussi la PRISE qui rend le webhook idempotent : seule une
       commande pas encore payée passe en « paid ». Stripe renvoie un
       événement s'il n'a pas eu de 200 à temps — sans cette garde, le
       client recevait deux confirmations et l'étiquette transporteur
       était créée deux fois. « cancelled » est inclus : un brouillon
       annulé comme doublon peut quand même être celui qui a été payé. */
    /* Remise réellement appliquée par Stripe. Celle du brouillon était
       calculée ici, Stripe recalcule la sienne (pourcentage arrondi
       ligne à ligne) : un centime d'écart suffisait pour que
       « sous-total − remise + port » ne retombe plus sur le total. */
    const remiseStripe = typeof session.total_details?.amount_discount === 'number'
      ? session.total_details.amount_discount / 100 : null;

    const { data: claimed, error: coreErr } = await supabaseAdmin.from('orders').update({
      customer_name:     customerName,
      customer_email:    customerEmail,
      subtotal:          subtotal > 0 ? subtotal : total,
      shipping:          shippingCost,
      total,
      ...(remiseStripe !== null ? { discount: remiseStripe } : {}),
      status:            'paid',
      stripe_session_id: session.id,
      updated_at:        new Date().toISOString(),
    }).eq('id', orderId).in('status', ['pending', 'abandoned', 'cancelled']).select('id');
    if (coreErr) {
      console.error('[webhook] MAJ commande (essentiel) échouée:', coreErr.message);
      // 500 → Stripe réessaiera ; rien d'autre n'a été fait.
      return { status: 500, body: { error: 'order update failed' } };
    }
    if (!claimed?.length) {
      console.log('[webhook] commande déjà traitée, événement ignoré', orderId, eventId);
      return { status: 200, body: { received: true, duplicate: true } };
    }

    // 2) Champs OPTIONNELS (téléphone, adresse) — séparés et non bloquants :
    //    une colonne manquante ou un type jsonb ne doit pas empêcher le "payé".
    const optional: Record<string, unknown> = {};
    if (customerPhone)   optional.customer_phone = customerPhone;
    if (effectiveAddress) optional.shipping_address = effectiveAddress;
    if (Object.keys(optional).length) {
      const { error: optErr } = await supabaseAdmin.from('orders').update(optional).eq('id', orderId);
      if (optErr) console.error('[webhook] MAJ commande (optionnel, non bloquant):', optErr.message);
    }

    /* Code promo : usage compté maintenant que la commande est payée.
       Seules les sessions qui portent promo_code_id sont concernées —
       celles ouvertes avant ce changement ont déjà été comptées. */
    const promoId = session.metadata?.promo_code_id;
    if (promoId) {
      try { await compterUsagePromo(promoId, customerEmail || existing?.customer_email || ''); }
      catch (e) { console.error('[webhook] usage du code promo non enregistré (non bloquant):', e); }
    }

    /* Relance des paniers : si ce client avait été relancé, son panier
       abandonné est marqué « récupéré » — AVANT l'annulation des
       brouillons ci-dessous, qui les sortirait du périmètre. */
    if (customerEmail) {
      try {
        const { marquerRecupere } = await import('@/lib/relance-panier');
        await marquerRecupere(customerEmail, orderId);
      } catch (e) { console.error('[webhook] marquage panier récupéré (non bloquant):', e); }
    }

    // Annuler les brouillons en attente du même client (doublons de checkout)
    if (customerEmail) {
      await supabaseAdmin.from('orders')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('customer_email', customerEmail)
        .eq('status', 'pending')
        .neq('id', orderId);
    }

    /* PLUS DE DEDUCTION ICI — c'est deliberé.
       `products.stock` designe desormais ce qui est physiquement en
       rayon. Une commande payee RESERVE sa marchandise (calcul dans
       @/lib/reserve) mais ne la fait pas disparaitre : elle est encore
       la, elle attend d'etre emballee. Le stock ne bouge qu'a
       l'expedition, quand le carton part.
       Deduire au paiement obligeait a compter de tete a chaque
       inventaire, et faisait apparaitre a zero des produits encore
       presents. */

    // Facture + compta : skip pour les commandes test
    if (isTestEvent || existing?.is_test) { /* skip */ } else
    // Facture automatique via invoice-utils (format correct)
    try {
      const { data: existingInv } = await supabaseAdmin
        .from('invoices').select('id').eq('order_id', orderId).maybeSingle();

      if (!existingInv) {
        const { createInvoiceFromOrder } = await import('@/lib/invoice-utils');
        const invoice = await createInvoiceFromOrder({
          ...existing,
          customer_name:    customerName,
          customer_email:   customerEmail,
          shipping_address: effectiveAddress,
          subtotal:         subtotal > 0 ? subtotal : total,
          shipping:         shippingCost,
          total,
          lines:            orderLines,
          status:           'paid',
        });

        if (invoice?.number) {
          await supabaseAdmin.from('orders')
            .update({ invoice_number: invoice.number }).eq('id', orderId);
        }
      }

      // Entrée comptable automatique
      // .limit(1) et non .maybeSingle() : sur doublons existants, maybeSingle
      // renvoie une erreur → data null → réinsertion (cause du CA gonflé).
      const { data: entryRows } = await supabaseAdmin
        .from('accounting_entries').select('id')
        .eq('reference_type', 'order').eq('reference_id', orderId).eq('type', 'income')
        .limit(1);
      if (!(entryRows && entryRows.length > 0)) {
        await supabaseAdmin.from('accounting_entries').insert({
          date:             jourParis(),
          type:             'income',
          category:         'vente_en_ligne',
          description:      `Commande ${existing?.order_number || ''}${customerName ? ' — ' + customerName : ''}`,
          amount:           total,
          reference_type:   'order',
          reference_id:     orderId,
          reference_number: existing?.order_number || '',
        });
      }

      // Frais Stripe automatiques (~1,5% + 0,25€ par transaction)
      const { data: stripeEntryRows } = await supabaseAdmin
        .from('accounting_entries').select('id')
        .eq('reference_type', 'order').eq('reference_id', orderId).eq('category', 'frais_stripe')
        .limit(1);
      if (!(stripeEntryRows && stripeEntryRows.length > 0) && total > 0) {
        const stripeFee = Math.round((total * 0.015 + 0.25) * 100) / 100;
        await supabaseAdmin.from('accounting_entries').insert({
          date:             jourParis(),
          type:             'expense',
          category:         'frais_stripe',
          description:      `Frais Stripe — ${existing?.order_number || ''}`,
          amount:           stripeFee,
          reference_type:   'order',
          reference_id:     orderId,
          reference_number: existing?.order_number || '',
        });
      }
    } catch (invErr) {
      console.error('[webhook] invoice/accounting error:', invErr);
    }

    /* Fidélité & parrainage : parrainage éventuel et codes mérités,
       annoncés dans la confirmation juste en dessous. Non bloquant. */
    let fidelite: import('@/lib/fidelite').BilanFidelite | undefined;
    if (customerEmail) {
      try {
        const { apresPaiement } = await import('@/lib/fidelite');
        fidelite = await apresPaiement({
          orderId,
          email:     customerEmail,
          nom:       customerName,
          telephone: customerPhone,
          promoCode: existing?.promo_code || null,
          estTest:   isTestEvent || !!existing?.is_test,
        });
      } catch (e) { console.error('[webhook] fidélité (non bloquant):', e); }
    }

    // Email de confirmation
    try {
      const cfg = await getWlConfig();
      const siteName  = cfg.site_name || '';
      const fromEmail = cfg.smtp_from || process.env.SMTP_FROM || process.env.RESEND_FROM || '';

      const orderForEmail = {
        ...(existing || {}),
        customer_name:    customerName,
        customer_email:   customerEmail,
        shipping_address: effectiveAddress,
        subtotal:         subtotal > 0 ? subtotal : total,
        shipping:         shippingCost,
        total,
        lines:            orderLines,
      };

      // Gabarit du handoff (src/emails/templates), rendu par customer-emails.
      const mail = await confirmationCommande({ ...existing, ...orderForEmail }, { fidelite });
      await sendEmail({
        from:    fromEmail,
        to:      customerEmail,
        subject: mail.sujet,
        html:    mail.html,
      }, cfg);

      // Notification interne — nouvelle commande
      try {
        const linesHtml = orderLines.map((l: any) =>
          `<tr>
            <td style="padding:4px 8px;border-bottom:1px solid #eee">${l.name || l.product_name || ''}</td>
            <td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:center">${l.qty}</td>
            <td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right">${((l.price || 0) * (l.qty || 1)).toFixed(2)} €</td>
          </tr>`
        ).join('');

        /* Notification interne — le seul email qui n'a pas de gabarit
           au handoff, celui-ci ne couvrant que les emails clients.
           Mis a la charte quand meme : c'est celui que tu vois le plus
           souvent, et il doit se lire d'un coup d'oeil sur telephone. */
        const notifHtml = `
          <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;background:#FDFBF5;border:1px solid #E3DCCB">
            <div style="height:7px;background:#44573D"></div>
            <div style="height:2px;background:#B49256"></div>
            <div style="padding:22px 24px">
              <div style="font-size:10px;letter-spacing:2.6px;text-transform:uppercase;color:#B49256;font-weight:bold">Nouvelle commande</div>
              <div style="font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:36px;color:#1F231C;padding-top:8px">
                ${existing?.order_number || ''} · ${total.toFixed(2)} €
              </div>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-top:16px;background:#F4EEE1">
                <tr><td style="padding:13px 15px;font-size:13px;line-height:21px;color:#5F5A4E">
                  <strong style="color:#1F231C">${customerName || '—'}</strong><br />
                  ${customerEmail || ''}${customerPhone ? ' · ' + customerPhone : ''}<br />
                  ${effectiveAddress || 'Adresse non renseignee'}
                </td></tr>
              </table>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin-top:16px">
                ${orderLines.map((l: any) => `
                  <tr>
                    <td style="padding:9px 0;border-bottom:1px solid #EFE9DC;font-size:13px;color:#1F231C">${l.name || l.product_name || ''}</td>
                    <td style="padding:9px 8px;border-bottom:1px solid #EFE9DC;font-size:13px;color:#948B79;text-align:center">x${l.qty}</td>
                    <td style="padding:9px 0;border-bottom:1px solid #EFE9DC;font-size:13px;color:#1F231C;text-align:right;font-weight:bold">${((l.price || 0) * (l.qty || 1)).toFixed(2)} €</td>
                  </tr>`).join('')}
              </table>

              ${shippingCost > 0 ? `<div style="text-align:right;font-size:12.5px;color:#5F5A4E;padding-top:10px">Livraison ${shippingCost.toFixed(2)} €</div>` : ''}

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-top:14px;background:#44573D">
                <tr>
                  <td style="padding:14px 16px;font-size:10px;letter-spacing:2.4px;text-transform:uppercase;color:#D8DCD2;font-weight:bold">Total</td>
                  <td style="padding:14px 16px;text-align:right;font-family:Georgia,serif;font-size:24px;color:#FDFBF5">${total.toFixed(2)} €</td>
                </tr>
              </table>

              <div style="font-size:11px;color:#948B79;padding-top:14px">
                ${existing?.relay_point_name ? 'Point relais · ' + existing.relay_point_name : 'Livraison a domicile'}
              </div>
            </div>
          </div>`;

        await sendEmail({
          from:    fromEmail,
          /* L'alerte interne va a la boite du marchand — sa config,
              jamais une adresse en dur. */
          to:      (cfg as any).email || (cfg as any).smtp_user || process.env.SMTP_FROM || '',
          subject: `Nouvelle commande ${existing?.order_number || ''} — ${customerName} (${total.toFixed(2)} €)`,
          html:    notifHtml,
        }, cfg);
      } catch (notifErr) {
        console.error('[webhook] notification email error:', notifErr);
      }

      /* Étiquette point relais via UGO.

         On ne force plus Mondial Relay par défaut. Le panier propose
         désormais le réseau le moins cher du pays — Shop2Shop hors de
         France, seul réseau desservant la Suède — et un colis ne se
         dépose pas dans le point d'un autre transporteur : il serait
         refusé au dépôt.

         Sans valeur stockée (commandes d'avant la migration 051), on
         laisse `undefined` : createLogspherRelayLabel interroge alors
         multi-rate et retient la meilleure offre pour la destination,
         ce qui redonne le bon réseau au lieu d'imposer le mauvais. */
      const relayCarrierUuid = existing?.relay_carrier_uuid || undefined;
      if (!isTestEvent && !existing?.is_test && existing?.delivery_mode === 'mondial_relay') {
        try {
          const { createLogspherRelayLabel } = await import('@/lib/logspher');
          const label = await createLogspherRelayLabel({
            order_number:        existing?.order_number || '',
            customer_name:       customerName,
            customer_email:      customerEmail,
            customer_phone:      customerPhone || existing?.customer_phone || '',
            relay_point_id:      existing?.relay_point_id || '',
            relay_point_name:    existing?.relay_point_name || '',
            relay_point_address: existing?.relay_point_address || '',
            relay_point_pays:    existing?.relay_point_pays || 'FR',
            relay_carrier_uuid:  relayCarrierUuid,
            lines:               orderLines,
            total,
          }, cfg);

          await supabaseAdmin.from('orders').update({
            tracking_number:       label.tracking_number,
            logspher_shipment_id:  label.shipment_id,
            logspher_tracking:     label.tracking_number,
            logspher_label_url:    label.label_url,
            logspher_carrier_name: label.carrier_name,
            logspher_carrier_code: label.carrier_code,
            updated_at:            new Date().toISOString(),
          }).eq('id', orderId);
        } catch (lsErr: any) {
          console.error('[webhook] logspher label error:', lsErr?.message || lsErr);
          try {
            await supabaseAdmin.from('orders').update({
              logspher_error: String(lsErr?.message || lsErr).slice(0, 500),
              updated_at:     new Date().toISOString(),
            }).eq('id', orderId);
          } catch { /* non-bloquant */ }
        }
      }

      // Second email facture
      if (!isTestEvent && !existing?.is_test) {
        try {
          const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL || '';
          await fetch(`${baseUrl}/api/send-invoice-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // Même secret que /api/send-invoice-email (plus de repli en clair : le dépôt est public).
            body: JSON.stringify({ order_id: orderId, secret: secretServeur('INTERNAL_SECRET', 'facture-interne') }),
          });
        } catch (invMailErr) {
          console.error('[webhook] invoice email error:', invMailErr);
        }
      }
    } catch (emailErr) {
      console.error('[webhook] email error:', emailErr);
    }

  } else {
    // Fallback : ancienne logique sans draft order
    // Idempotence : une session déjà enregistrée n'est pas recréée.
    const { data: dejaLa } = await supabaseAdmin
      .from('orders').select('id').eq('stripe_session_id', session.id).limit(1);
    if (dejaLa?.length) return { status: 200, body: { received: true, duplicate: true } };

    const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 100 });
    const lines = lineItems.data.map((li) => ({
      name:  li.description,
      qty:   li.quantity,
      price: (li.amount_total || 0) / 100 / (li.quantity || 1),
    }));

    const { count: orderCount } = await supabaseAdmin
      .from('orders').select('id', { count: 'exact', head: true });
    const num = String((orderCount || 0) + 1).padStart(4, '0');

    await supabaseAdmin.from('orders').insert({
      order_number:     `SD-${num}`,
      customer_name:    customerName,
      customer_email:   customerEmail,
      shipping_address: shippingAddress,
      total,
      status:           'paid',
      lines:            JSON.stringify(lines),
      stripe_session_id: session.id,
    });
  }

  return { status: 200, body: { received: true } };
}
