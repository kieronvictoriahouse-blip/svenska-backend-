import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';
import { getWhiteLabelConfig, sendEmail, baseTemplate } from '@/lib/email-send';
import { nextSequentialNumber } from '@/lib/invoice-utils';

const round2 = (n: any) => Math.round((Number(n) || 0) * 100) / 100;
const fmtEur = (n: number) => `${round2(n).toFixed(2)} €`;

/** Ligne de commande créditée lors d'un remboursement partiel */
type RefundItem = { index: number; qty: number };

/**
 * POST /api/orders/[id]/refund
 *
 * Sans body (ou sans `amount`)  → remboursement INTÉGRAL (comportement historique).
 * Avec `amount`                 → remboursement PARTIEL :
 *   {
 *     amount:           number,        // € TTC réellement remboursés au client
 *     items?:           [{ index, qty }],  // lignes créditées (avoir + remise en stock)
 *     shipping_charge?: number,        // frais de port retenus sur le remboursement
 *     reason?:          string,
 *     restock?:         boolean,       // défaut true
 *     notify?:          boolean,       // défaut true — email client
 *     modify_order?:    boolean,       // retire les lignes créditées de la commande
 *                                      // et y ajoute les frais de port retenus
 *   }
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const body: any = await req.json().catch(() => ({}));
  const stripeKey = process.env.STRIPE_SECRET_KEY;

  const { data: order, error: orderErr } = await supabaseAdmin
    .from('orders').select('*').eq('id', params.id).single();

  if (orderErr || !order) return NextResponse.json({ error: 'Commande non trouvée' }, { status: 404 });
  if (order.status === 'refunded') return NextResponse.json({ error: 'Déjà remboursée' }, { status: 400 });

  const orderTotal      = round2(order.total);
  const alreadyRefunded = round2(order.refunded_amount);

  // Reste remboursable : les remboursements déjà répercutés dans `total`
  // (order_modified) ne doivent pas être déduits une seconde fois.
  const history: any[] = Array.isArray(order.refunds) ? order.refunds : [];
  const pendingRefunded = round2(history.length > 0
    ? history.filter(r => !r.order_modified).reduce((s, r) => s + (Number(r.amount) || 0), 0)
    : alreadyRefunded);
  const remaining = round2(orderTotal - pendingRefunded);

  const isPartial = body.amount != null && body.amount !== '';
  const amount    = isPartial ? round2(body.amount) : remaining;

  if (isPartial) {
    if (!(amount > 0)) {
      return NextResponse.json({ error: 'Montant de remboursement invalide' }, { status: 400 });
    }
    if (amount > remaining + 0.005) {
      return NextResponse.json({
        error: `Montant supérieur au reste remboursable (${fmtEur(remaining)})`,
      }, { status: 400 });
    }
  }

  // Le remboursement solde-t-il la commande ?
  const closesOrder = !isPartial || amount >= remaining - 0.005;

  const orderLines: any[] = (() => {
    try { return typeof order.lines === 'string' ? JSON.parse(order.lines) : (order.lines || []); }
    catch { return []; }
  })();

  // Lignes créditées (partiel) — validées contre les lignes réelles de la commande
  const items: RefundItem[] = Array.isArray(body.items)
    ? body.items
        .map((it: any) => {
          const index = Number(it.index);
          const maxQty = Number(orderLines[index]?.qty) || 1;
          return { index, qty: Math.min(Number(it.qty) || 0, maxQty) };
        })
        .filter((it: RefundItem) => orderLines[it.index] && it.qty > 0)
    : [];

  const shippingKept = round2(body.shipping_charge);
  const reason       = (body.reason || '').toString().trim();
  const doRestock    = body.restock !== false;
  const doNotify     = body.notify  !== false;
  const modifyOrder  = isPartial && body.modify_order === true;

  // ── Réécriture de la commande ─────────────────────────────────────
  // Les lignes créditées sortent de la commande (elles ne partent pas au client)
  // et les frais de port retenus y entrent : la commande reflète ce qui est
  // réellement expédié et facturé.
  let rewrittenLines: any[] | null = null;
  let newSubtotal = round2(order.subtotal);
  let newShipping = round2(order.shipping);
  if (modifyOrder) {
    rewrittenLines = orderLines
      .map((l: any, i: number) => {
        const it = items.find(x => x.index === i);
        if (!it) return l;
        const remainingQty = (Number(l.qty) || 1) - it.qty;
        return remainingQty > 0 ? { ...l, qty: remainingQty } : null;
      })
      .filter(Boolean) as any[];
    newSubtotal = round2(rewrittenLines.reduce(
      (s, l) => s + (Number(l.price) || 0) * (Number(l.qty) || 1), 0));
    newShipping = round2(newShipping + shippingKept);
  }

  // ── Remboursement Stripe ──────────────────────────────────────────
  let refundId: string | null = null;
  if (stripeKey && order.stripe_session_id) {
    try {
      const stripe = new Stripe(stripeKey, { apiVersion: '2026-04-22.dahlia' });
      const session = await stripe.checkout.sessions.retrieve(order.stripe_session_id);
      const paymentIntentId = session.payment_intent as string;
      if (paymentIntentId) {
        const refund = await stripe.refunds.create({
          payment_intent: paymentIntentId,
          // Stripe raisonne en centimes ; sans `amount` il rembourse tout
          ...(isPartial ? { amount: Math.round(amount * 100) } : {}),
          metadata: {
            order_number: order.order_number || '',
            type:         isPartial ? 'partiel' : 'total',
            ...(reason ? { motif: reason.slice(0, 400) } : {}),
            ...(shippingKept > 0 ? { frais_port_retenus: shippingKept.toFixed(2) } : {}),
          },
        });
        refundId = refund.id;
      }
    } catch (e: any) {
      return NextResponse.json({ error: `Erreur Stripe : ${e.message}` }, { status: 500 });
    }
  }

  // ── Mise à jour commande ──────────────────────────────────────────
  const newRefundedTotal = round2(alreadyRefunded + amount);
  const historyEntry = {
    date:             new Date().toISOString(),
    amount,
    shipping_kept:    shippingKept,
    reason:           reason || null,
    stripe_refund_id: refundId,
    // true → lignes/port/total de la commande déjà corrigés, ne pas re-déduire côté stats
    order_modified:   modifyOrder,
    items:            items.map(it => ({
      product_id: orderLines[it.index]?.product_id || null,
      name:       orderLines[it.index]?.name || orderLines[it.index]?.desc || orderLines[it.index]?.name_fr || 'Article',
      qty:        it.qty,
      price:      round2(orderLines[it.index]?.price),
      restocked:  doRestock && !!orderLines[it.index]?.product_id,
    })),
  };
  const prevHistory = history;

  // Réécriture éventuelle du contenu de la commande
  const orderRewrite = modifyOrder ? {
    lines:    rewrittenLines,
    subtotal: newSubtotal,
    shipping: newShipping,
    total:    round2(orderTotal - amount),   // ce que le client garde effectivement payé
  } : {};

  let migrationMissing = false;
  const { error: updErr } = await supabaseAdmin.from('orders').update({
    ...orderRewrite,
    ...(closesOrder ? { status: 'refunded' } : {}),
    refunded_amount: newRefundedTotal,
    refunded_at:     new Date().toISOString(),
    refunds:         [...prevHistory, historyEntry],
    updated_at:      new Date().toISOString(),
  }).eq('id', params.id);

  if (updErr) {
    // Migration 028 pas encore appliquée → on ne bloque pas, l'argent est déjà parti
    migrationMissing = true;
    console.error('[refund] colonnes partielles absentes (migration 028 ?) :', updErr.message);
    await supabaseAdmin.from('orders').update({
      ...orderRewrite,
      ...(closesOrder ? { status: 'refunded' } : {}),
      updated_at: new Date().toISOString(),
    }).eq('id', params.id);
  }

  // ── Ré-incrément stock ────────────────────────────────────────────
  // Total : toutes les lignes. Partiel : uniquement les lignes créditées.
  if (doRestock) {
    const toRestock = isPartial
      ? items.map(it => ({ product_id: orderLines[it.index]?.product_id, qty: it.qty }))
      : orderLines.map((l: any) => ({ product_id: l.product_id, qty: l.qty || 1 }));

    for (const r of toRestock) {
      if (!r.product_id) continue;
      try {
        const { data: prod } = await supabaseAdmin
          .from('products').select('stock').eq('id', r.product_id).single();
        if (prod) {
          await supabaseAdmin.from('products')
            .update({ stock: (prod.stock || 0) + (r.qty || 1) })
            .eq('id', r.product_id);
        }
      } catch { /* non bloquant */ }
    }
  }

  // ── Avoir + contre-passation comptable ───────────────────────────
  let avoirNumber: string | null = null;
  try {
    const year  = new Date().getFullYear();
    const today = new Date().toISOString().split('T')[0];

    // Récupérer la facture originale
    const { data: originalInv } = await supabaseAdmin
      .from('invoices').select('*').eq('order_id', params.id).neq('status', 'avoir').maybeSingle();

    // Pas de facture émise sur un remboursement partiel → rien à contre-passer :
    // la facture sera générée plus tard depuis la commande déjà corrigée.
    const skipAvoir = isPartial && !originalInv;

    // Numéro d'avoir séquentiel (même logique fiable que les factures)
    if (!skipAvoir) avoirNumber = await nextSequentialNumber(`AV-${year}-`);

    // Lignes de l'avoir
    let avoirLines: any[];
    if (!isPartial) {
      try {
        avoirLines = originalInv?.lines
          ? (typeof originalInv.lines === 'string' ? JSON.parse(originalInv.lines) : originalInv.lines)
          : [];
      } catch { avoirLines = []; }
    } else {
      avoirLines = items.map(it => {
        const l = orderLines[it.index] || {};
        return {
          desc:  l.name_fr || l.name || l.desc || l.label || 'Article',
          qty:   it.qty,
          price: round2(l.price),
          tva:   0,
        };
      });
      // Frais de port retenus : ils viennent en déduction de l'avoir
      if (shippingKept > 0) {
        avoirLines.push({ desc: 'Frais de livraison facturés', qty: 1, price: -shippingKept, tva: 0 });
      }
      // Cohérence document : le total de l'avoir doit valoir le montant réellement remboursé
      const linesSum = round2(avoirLines.reduce((s, l) => s + (l.qty || 1) * (l.price || 0), 0));
      if (Math.abs(linesSum - amount) > 0.005) {
        avoirLines.push({ desc: 'Ajustement commercial', qty: 1, price: round2(amount - linesSum), tva: 0 });
      }
      if (avoirLines.length === 0) {
        avoirLines = [{ desc: reason || 'Remboursement partiel', qty: 1, price: amount, tva: 0 }];
      }
    }

    // Créer l'avoir (montants négatifs)
    if (!skipAvoir) await supabaseAdmin.from('invoices').insert({
      number:         avoirNumber,
      date:           today,
      status:         'avoir',
      client_name:    originalInv?.client_name    || order.customer_name  || '',
      client_address: originalInv?.client_address || '',
      client_email:   originalInv?.client_email   || order.customer_email || '',
      lines:          typeof avoirLines === 'string' ? avoirLines : JSON.stringify(avoirLines),
      total_ht:       -amount,
      total_tva:      0,
      total_ttc:      -amount,
      note:           `${isPartial ? 'Avoir partiel' : 'Avoir'} sur ${originalInv?.number || order.order_number}${reason ? ` — ${reason}` : ''}`,
      order_id:       order.id,
      legal_mention:  originalInv?.legal_mention  || '',
      seller_name:    originalInv?.seller_name    || '',
      seller_siret:   originalInv?.seller_siret   || '',
      seller_address: originalInv?.seller_address || '',
      seller_email:   originalInv?.seller_email   || '',
      seller_phone:   originalInv?.seller_phone   || '',
    });

    // Marquer la facture originale comme remboursée (seulement si soldée)
    if (originalInv && closesOrder) {
      await supabaseAdmin.from('invoices').update({ status: 'refunded' }).eq('id', originalInv.id);
    }

    // Contre-passation de la recette
    const { data: incomeEntry } = await supabaseAdmin
      .from('accounting_entries').select('*')
      .eq('reference_type', 'order').eq('reference_id', params.id).eq('type', 'income')
      .maybeSingle();
    if (incomeEntry) {
      await supabaseAdmin.from('accounting_entries').insert({
        date:             today,
        type:             'income',
        category:         incomeEntry.category,
        description:      `${isPartial ? 'Remboursement partiel' : 'Remboursement'} — ${order.order_number}${reason ? ` (${reason})` : ''}`,
        amount:           -amount,
        reference_type:   'refund',
        reference_id:     params.id,
        reference_number: order.order_number,
      });
    }

    // Contre-passation des frais Stripe — uniquement sur remboursement intégral.
    // Sur un remboursement partiel Stripe conserve ses frais : rien à contre-passer.
    if (!isPartial) {
      const { data: stripeEntry } = await supabaseAdmin
        .from('accounting_entries').select('*')
        .eq('reference_type', 'order').eq('reference_id', params.id).eq('category', 'frais_stripe')
        .maybeSingle();
      if (stripeEntry) {
        await supabaseAdmin.from('accounting_entries').insert({
          date:             today,
          type:             'expense',
          category:         'frais_stripe',
          description:      `Remboursement frais Stripe — ${order.order_number}`,
          amount:           -stripeEntry.amount,
          reference_type:   'refund',
          reference_id:     params.id,
          reference_number: order.order_number,
        });
      }
    }
  } catch (e) {
    console.error('[refund] avoir/accounting error:', e);
  }

  // ── Email client ──────────────────────────────────────────────────
  if (doNotify && order.customer_email) {
    try {
      const cfg = await getWhiteLabelConfig();
      const siteName  = cfg.site_name || '';
      const fromEmail = cfg.smtp_from || process.env.SMTP_FROM || process.env.RESEND_FROM || "hej@swedishcravings.fr";

      const detailHtml = isPartial
        ? [
            ...items.map(it => {
              const l = orderLines[it.index] || {};
              const label = l.name_fr || l.name || l.desc || 'Article';
              return `<div class="line"><span>${label} × ${it.qty}</span><span>${fmtEur((l.price || 0) * it.qty)}</span></div>`;
            }),
            shippingKept > 0
              ? `<div class="line"><span>Frais de livraison</span><span>−${fmtEur(shippingKept)}</span></div>`
              : '',
            `<hr class="divider">`,
            `<div class="line total"><span>Montant remboursé</span><span>${fmtEur(amount)}</span></div>`,
          ].join('')
        : `<div class="line total"><span>Total TTC</span><span>${fmtEur(amount)}</span></div>`;

      const content = isPartial
        ? `
      <h1 class="title">Remboursement partiel</h1>
      <p class="text">Bonjour ${order.customer_name},</p>
      <p class="text">Suite à la modification de votre commande <strong>${order.order_number}</strong>, un remboursement partiel de <strong>${fmtEur(amount)}</strong> a été initié.</p>
      ${reason ? `<p class="text">${reason}</p>` : ''}
      <div class="box">
        <div class="box-title">💶 Détail du remboursement</div>
        ${detailHtml}
      </div>
      <p class="text">Le remboursement apparaîtra sur votre compte bancaire sous <strong>5 à 10 jours ouvrés</strong>, selon votre banque.</p>
      ${cfg.email ? `<p class="text" style="font-size:13px">Des questions ? <a href="mailto:${cfg.email}" style="color:#3E4550">${cfg.email}</a></p>` : ''}
      <p class="text">Merci de votre confiance.</p>`
        : `
      <h1 class="title">Remboursement confirmé</h1>
      <p class="text">Bonjour ${order.customer_name},</p>
      <p class="text">Votre commande <strong>${order.order_number}</strong> a été annulée et le remboursement intégral a été initié.</p>
      <div class="box">
        <div class="box-title">💶 Montant remboursé</div>
        ${detailHtml}
      </div>
      <p class="text">Le remboursement apparaîtra sur votre compte bancaire sous <strong>5 à 10 jours ouvrés</strong>, selon votre banque.</p>
      ${cfg.email ? `<p class="text" style="font-size:13px">Des questions ? <a href="mailto:${cfg.email}" style="color:#3E4550">${cfg.email}</a></p>` : ''}
      <p class="text">Merci de votre confiance.</p>`;

      await sendEmail({
        from:    fromEmail,
        to:      order.customer_email,
        subject: `💶 ${isPartial ? 'Remboursement partiel' : 'Remboursement'} ${order.order_number}${siteName ? ` — ${siteName}` : ''}`,
        html:    baseTemplate(content, `Remboursement ${order.order_number}`, cfg),
      }, cfg);
    } catch (e) {
      console.error('[refund] email error:', e);
    }
  }

  return NextResponse.json({
    success:         true,
    refund_id:       refundId,
    amount,
    partial:         isPartial && !closesOrder,
    refunded_amount: newRefundedTotal,
    remaining:       round2(orderTotal - newRefundedTotal),
    status:          closesOrder ? 'refunded' : order.status,
    avoir_number:    avoirNumber,
    ...(migrationMissing ? { warning: 'Colonnes de remboursement partiel absentes — applique la migration 028_orders_partial_refund.sql' } : {}),
  });
}
