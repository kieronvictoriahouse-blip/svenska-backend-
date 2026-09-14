import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/* ═══════════════════════════════════════════════════════════════
   SUIVI DES LIVRAISONS — demande au transporteur si le colis est arrivé

   Une commande expédiée ne redevenait jamais « livrée » toute seule :
   il fallait qu'un humain change le statut à la main. Personne ne le
   faisait, et 22 commandes dormaient en « expédiée » — donc aucune
   demande d'avis n'est jamais partie, puisqu'elle se déclenche sur
   « livrée ».

   Ce cron interroge UGO (is-delivered) pour chaque colis encore en
   transit, marque les arrivées, et prévient le client :
     — point relais → « votre colis vous attend », avec le nom du relais.
       Un colis en relais n'est pas livré : le client doit venir.
     — domicile     → message de livraison classique.

   Les colis sans numéro de suivi sont ignorés : rien à demander au
   transporteur. Un colis en transit depuis plus de 60 jours est
   abandonné, pour ne pas interroger l'API indéfiniment.
   ═══════════════════════════════════════════════════════════════ */

const API_URL = process.env.LOGSPHER_API_URL || 'https://upelgo.com';
const UUID_DEFAUT = process.env.LOGSPHER_MR_UUID || 'b139ac1f-bbb9-4235-b87e-aedcb3c32132';
const ABANDON_JOURS = 60;

async function estLivre(carrierUuid: string, tracking: string) {
  const cle = process.env.LOGSPHER_API_KEY;
  if (!cle) throw new Error('LOGSPHER_API_KEY manquante');

  const res = await fetch(`${API_URL}/api/carrier/${carrierUuid}/is-delivered`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ tracking_number: tracking }),
  });
  const texte = await res.text();
  if (!res.ok) throw new Error(`is-delivered ${res.status}: ${texte.slice(0, 200)}`);

  let j: any = {};
  try { j = JSON.parse(texte); } catch { /* réponse illisible = pas de conclusion */ }
  return { livre: j?.success === true, date: j?.date || null };
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  const limite = new Date(Date.now() - ABANDON_JOURS * 86400_000).toISOString();

  const { data: enTransit, error } = await supabaseAdmin
    .from('orders')
    .select('id,order_number,status,customer_email,customer_name,lang,lines,shipped_qty,last_shipment,' +
            'relay_point_name,relay_point_address,relay_carrier_uuid,delivery_mode,created_at,' +
            'logspher_tracking,mondial_relay_tracking,tracking_number')
    .eq('status', 'shipped')
    .gte('created_at', limite)
    .limit(80);

  if (error) {
    return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  }

  const rapport = { examinees: 0, sans_suivi: 0, livrees: 0, en_transit: 0, echecs: [] as string[] };

  for (const o of ((enTransit || []) as any[])) {
    const tracking = o.logspher_tracking || o.mondial_relay_tracking || o.tracking_number;
    if (!tracking) { rapport.sans_suivi++; continue; }
    rapport.examinees++;

    try {
      const { livre, date } = await estLivre(o.relay_carrier_uuid || UUID_DEFAUT, tracking);
      if (!livre) { rapport.en_transit++; continue; }

      await supabaseAdmin.from('orders')
        .update({ status: 'delivered', updated_at: date || new Date().toISOString() })
        .eq('id', o.id)
        .eq('status', 'shipped');   // ne rien écraser si le statut a bougé entre-temps

      rapport.livrees++;

      /* Le client est prévenu du même geste. Un email raté ne doit pas
         empêcher le statut d'avancer — le colis, lui, est bien arrivé. */
      if (o.customer_email) {
        try {
          const enRelais = !!(o.relay_point_name || o.relay_point_address);
          const { expeditionEmail, colisDisponibleEmail } = await import('@/lib/customer-emails');
          const { getWhiteLabelConfig, sendEmail } = await import('@/lib/email-send');
          const cfg = await getWhiteLabelConfig();
          const from = (cfg.email_from as string) || (cfg as any).smtp_from || '';
          const mail = enRelais
            ? await colisDisponibleEmail({ ...o, tracking_number: tracking })
            : await expeditionEmail({ ...o, tracking_number: tracking });
          await sendEmail({ from, to: o.customer_email, subject: mail.sujet, html: mail.html }, cfg);
        } catch (e: any) {
          rapport.echecs.push(`${o.order_number} email: ${e?.message || e}`);
        }
      }
    } catch (e: any) {
      rapport.echecs.push(`${o.order_number}: ${e?.message || e}`);
    }
  }

  return NextResponse.json({ ok: true, ...rapport });
}
