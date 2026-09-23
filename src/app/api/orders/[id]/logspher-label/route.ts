import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';
import { getWlConfig } from '@/lib/mailer';
import { createLogspherRelayLabel, cancelLogspherLabel } from '@/lib/logspher';

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

  if (order.delivery_mode !== 'mondial_relay') {
    return NextResponse.json({ error: 'Commande sans point relais' }, { status: 400 });
  }
  // Évite une double étiquette (donc une double facturation UGO).
  if (order.logspher_label_url) {
    return NextResponse.json({ error: 'Une étiquette existe déjà pour cette commande' }, { status: 409 });
  }

  // `lines` est stockée comme chaîne JSON (voir jsonb-lines).
  const lines = order.lines
    ? (typeof order.lines === 'string' ? JSON.parse(order.lines) : order.lines)
    : [];

  // Poids réel pesé, facultatif (sinon estimation catalogue + tare).
  const body = await req.json().catch(() => ({}));
  const weightGrams = Number(body?.weight_grams) > 0 ? Number(body.weight_grams) : undefined;

  try {
    const cfg = await getWlConfig();
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
    await cancelLogspherLabel(order.order_number);
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
