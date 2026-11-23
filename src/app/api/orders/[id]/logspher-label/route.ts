import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';
import { getWlConfig } from '@/lib/mailer';
import { createLogspherRelayLabel, createLogspherChronoFraisLabel, cancelLogspherLabel, referenceUgo } from '@/lib/logspher';
import { attachExistingLogspherLabel } from '@/lib/logspher-sync';

/* Relance l'étiquette point relais UGO d'une commande.
   Le webhook Stripe ne tente l'étiquette qu'une fois, au paiement :
   s'il échoue (ex. SD-0150, téléphone expéditeur vide), la commande
   garde `logspher_error` et rien ne la retente. Même charge que le
   webhook, déclenchée à la main depuis l'admin. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const { data: order, error } = await supabaseAdmin
    .from('orders').select('*').eq('id', params.id).single();
  if (error || !order) return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 });

  /* Point relais, ou produits frais en Chrono 18 à domicile (migration 070) :
     pour ceux-là, l'étiquette ne se crée qu'ici, le jour du dépôt. */
  const estFrais = order.delivery_mode === 'domicile_frais';
  if (order.delivery_mode !== 'mondial_relay' && !estFrais) {
    return NextResponse.json({ error: 'Commande sans point relais ni livraison Chrono 18' }, { status: 400 });
  }
  // Une étiquette UGO se paie : jamais pour une commande annulée ou remboursée.
  if (['cancelled', 'refunded', 'pending', 'abandoned'].includes(order.status)) {
    return NextResponse.json({ error: `Commande au statut « ${order.status} » : pas d’étiquette` }, { status: 409 });
  }
  // Évite une double étiquette (donc une double facturation UGO).
  if (order.logspher_label_url) {
    return NextResponse.json({ error: 'Une étiquette existe déjà pour cette commande' }, { status: 409 });
  }

  /* Référence UGO : SD-0238, ou SD-0238-2… si une étiquette annulée a déjà
     consommé le numéro (UGO refuse alors de le réutiliser : 412).
     Un envoi encore actif sous l'une de ces références (402 réglé via le
     lien, cas SD-0146) est relu et rattaché, sans rien refacturer. */
  let ref: { active: string | null; libre: string | null };
  try {
    ref = await referenceUgo(order.order_number);
  } catch (e: any) {
    return NextResponse.json({ error: `Lecture UGO impossible, rien n’a été créé : ${String(e?.message || e).slice(0, 300)}` }, { status: 502 });
  }
  if (ref.active) {
    try {
      const att = await attachExistingLogspherLabel(order, { reference: ref.active });
      if (att.attached) {
        return NextResponse.json({
          success: true, recovered: true, emailed: att.emailed,
          ...att.patch, tracking_number: order.tracking_number || att.tracking_number,
        });
      }
    } catch (e: any) {
      console.error('[logspher-label] relecture UGO :', e?.message || e);
    }
    return NextResponse.json({ error: `Un envoi UGO ${ref.active} existe déjà pour cette commande, sans étiquette prête (paiement en attente ?) : vois upelgo.com, section Envois.` }, { status: 409 });
  }
  const ugoReference = ref.libre || order.order_number;

  // `lines` est stockée comme chaîne JSON (voir jsonb-lines).
  const lines = order.lines
    ? (typeof order.lines === 'string' ? JSON.parse(order.lines) : order.lines)
    : [];

  // Poids réel pesé, facultatif (sinon estimation catalogue + tare).
  const body = await req.json().catch(() => ({}));
  const weightGrams = Number(body?.weight_grams) > 0 ? Number(body.weight_grams) : undefined;

  try {
    const cfg = await getWlConfig();
    if (estFrais) {
      const chrono = await createLogspherChronoFraisLabel({
        order_number:     order.order_number || '',
        customer_name:    order.customer_name || '',
        customer_email:   order.customer_email || '',
        customer_phone:   order.customer_phone || '',
        shipping_address: order.shipping_address || '',
        lines,
        total:            Number(order.total) || 0,
        weight_grams:     weightGrams,
        ugo_reference:    ugoReference,
      }, cfg as any);
      const patchFrais = {
        tracking_number:       chrono.tracking_number,
        logspher_shipment_id:  chrono.shipment_id,
        logspher_tracking:     chrono.tracking_number,
        logspher_label_url:    chrono.label_url,
        logspher_carrier_name: chrono.carrier_name,
        logspher_carrier_code: chrono.carrier_code,
        logspher_error:        null,
        // Transporteur UGO de l'envoi : le suivi quotidien (cron livraisons) en a besoin.
        ...(chrono.carrier_uuid ? { relay_carrier_uuid: chrono.carrier_uuid } : {}),
        updated_at:            new Date().toISOString(),
      };
      await supabaseAdmin.from('orders').update(patchFrais).eq('id', order.id);
      return NextResponse.json({ success: true, ...patchFrais });
    }
    const label = await createLogspherRelayLabel({
      order_number:        order.order_number || '',
      customer_name:       order.customer_name || '',
      customer_email:      order.customer_email || '',
      customer_phone:      order.customer_phone || '',
      relay_point_id:      order.relay_point_id || '',
      relay_point_name:    order.relay_point_name || '',
      relay_point_address: order.relay_point_address || '',
      relay_point_pays:    order.relay_point_pays || 'FR',
      relay_carrier_uuid:  order.relay_carrier_uuid || undefined,
      lines,
      total:               Number(order.total) || 0,
      weight_grams:        weightGrams,
      ugo_reference:       ugoReference,
      // Hors EUR : la valeur déclarée à UGO reste en euros (contre-valeur relevée au paiement).
      ...(order.currency && order.currency !== 'EUR' ? {
        currency:  order.currency,
        total_eur: order.total_eur != null ? Number(order.total_eur) : null,
        fx_rate:   order.fx_rate   != null ? Number(order.fx_rate)   : null,
      } : {}),
    }, cfg as any);

    const patch = {
      tracking_number:       label.tracking_number,
      logspher_shipment_id:  label.shipment_id,
      logspher_tracking:     label.tracking_number,
      logspher_label_url:    label.label_url,
      logspher_carrier_name: label.carrier_name,
      logspher_carrier_code: label.carrier_code,
      logspher_error:        null,
      updated_at:            new Date().toISOString(),
    };
    await supabaseAdmin.from('orders').update(patch).eq('id', order.id);
    return NextResponse.json({ success: true, ...patch });
  } catch (e: any) {
    const msg = String(e?.message || e).slice(0, 500);
    await supabaseAdmin.from('orders').update({
      logspher_error: msg,
      updated_at:     new Date().toISOString(),
    }).eq('id', order.id);
    return NextResponse.json({ error: msg, logspher_error: msg }, { status: 502 });
  }
}

/* Annule l'étiquette UGO : la commande passe en Click & Collect ou est
   annulée. Idéalement avant le dépôt du colis au point relais. */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const { data: order, error } = await supabaseAdmin
    .from('orders').select('*').eq('id', params.id).single();
  if (error || !order) return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 });
  if (!order.logspher_label_url && !order.logspher_shipment_id) {
    return NextResponse.json({ error: 'Aucune étiquette UGO à annuler' }, { status: 400 });
  }

  try {
    // L'étiquette active peut être sous SD-0238-2… (recréée après une annulation).
    let aAnnuler = order.order_number;
    try { aAnnuler = (await referenceUgo(order.order_number)).active || order.order_number; }
    catch (e: any) { console.error('[logspher-label] référence UGO :', e?.message || e); }
    await cancelLogspherLabel(aAnnuler);
  } catch (e: any) {
    const msg = String(e?.message || e);
    // 404 = UGO ne connaît plus l'envoi (déjà annulé) : on nettoie quand même.
    if (!/→ 404/.test(msg)) {
      return NextResponse.json({ error: msg.slice(0, 500) }, { status: 502 });
    }
  }

  const patch: Record<string, any> = {
    logspher_shipment_id:  null,
    logspher_tracking:     null,
    logspher_label_url:    null,
    logspher_carrier_name: null,
    logspher_carrier_code: null,
    logspher_error:        null,
    updated_at:            new Date().toISOString(),
  };
  // Ne vider le suivi que s'il venait de cette étiquette.
  if (order.tracking_number && order.tracking_number === order.logspher_tracking) patch.tracking_number = null;
  await supabaseAdmin.from('orders').update(patch).eq('id', order.id);
  return NextResponse.json({ success: true, ...patch });
}
