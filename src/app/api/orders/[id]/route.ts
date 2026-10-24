import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { expeditionEmail } from '@/lib/customer-emails';
import { requireAuth } from '@/lib/auth';
import { createInvoiceFromOrder } from '@/lib/invoice-utils';
import { getWhiteLabelConfig, sendEmail } from '@/lib/email-send';
import { envoyerEmailLivraison } from '@/lib/email-livraison';
import { resteDu, sortirColis } from '@/lib/expedition';

/** Statuts où la marchandise a quitté l'étagère. */
const PARTIS = ['shipped', 'delivered'];
/** Statuts d'une commande payée. */
const PAYES = ['paid', 'confirmed', 'preparing', 'partial', 'shipped', 'delivered'];

/** Raison du refus d'une transition, ou null si elle est permise. */
function transitionRefusee(avant?: string, apres?: string): string | null {
  if (!apres || !avant || apres === avant) return null;
  if (apres === 'partial') {
    return 'Le statut « Partielle » se pose en expédiant un colis depuis la préparation, pas à la main.';
  }
  if (avant === 'refunded') return 'Commande remboursée : son statut ne change plus.';
  if (avant === 'cancelled' && PARTIS.includes(apres)) {
    return 'Commande annulée : repasse-la d’abord en « Payée » avant de l’expédier.';
  }
  if (PARTIS.includes(avant) && !PARTIS.includes(apres) && !['cancelled', 'refunded'].includes(apres)) {
    return 'Commande déjà partie : elle ne peut pas revenir à un statut d’avant l’expédition.';
  }
  if (PAYES.includes(avant) && ['pending', 'abandoned'].includes(apres)) {
    return 'Commande payée : elle ne peut pas redevenir un panier non payé.';
  }
  return null;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  // Une commande porte le nom, l'adresse et les montants du client.
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401, headers: CORS });
  const { data, error } = await supabaseAdmin.from('orders').select('*').eq('id', params.id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: CORS });
  return NextResponse.json({ order: data }, { headers: CORS });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401, headers: CORS });
  const body = await req.json();

  // Statut avant update
  const { data: before } = await supabaseAdmin.from('orders').select('*').eq('id', params.id).single();
  if (!before) return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 });
  const prevStatus = before?.status;

  /* Les puces « Changer le statut » proposent tous les statuts : c'est
     ici, pas dans l'écran, qu'on refuse ceux qui mentiraient. */
  const refus = transitionRefusee(prevStatus, body?.status);
  if (refus) return NextResponse.json({ error: refus }, { status: 409 });

  /* ── Départ posé à la main ────────────────────────────────────────
     « Marquer expédiée », une puce « Expédiée »/« Livrée » : la commande
     quitte les statuts dus, sa réservation tombe — il faut donc que la
     marchandise sorte du stock, comme depuis la préparation. Sans ça, le
     rayon gardait des unités parties chez le client. On solde ce qui
     reste dû, réclamé sous condition du statut lu : un double clic ou un
     second poste ne sort rien deux fois. Une commande de test ne
     réserve rien, elle ne sort donc rien non plus. */
  const now = new Date().toISOString();
  const depart = !!body?.status && PARTIS.includes(body.status) && !PARTIS.includes(prevStatus) && !before.is_test;
  const colis = depart ? resteDu(before) : {};
  const solde: Record<string, any> = {};
  if (Object.keys(colis).length) {
    const cumul: Record<string, number> = { ...(before.shipped_qty || {}) };
    for (const [pid, n] of Object.entries(colis)) cumul[pid] = (Number(cumul[pid]) || 0) + n;
    Object.assign(solde, { shipped_qty: cumul, last_shipment: colis, picked_at: now, picking: null });
  }

  let ecriture = supabaseAdmin.from('orders')
    .update({ ...body, ...solde, updated_at: now })
    .eq('id', params.id);
  if (Object.keys(solde).length) ecriture = ecriture.eq('status', prevStatus);
  const { data: lignesMaj, error } = await ecriture.select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const data = lignesMaj?.[0];
  if (!data) {
    return NextResponse.json({ error: 'La commande vient de changer sur un autre poste — recharge-la avant de réessayer.' }, { status: 409 });
  }

  let echecsStock: Array<{ product_id: string; erreur: string }> = [];
  if (Object.keys(solde).length) {
    try { echecsStock = (await sortirColis(before, colis)).echecs; }
    catch (e: any) { echecsStock = [{ product_id: '*', erreur: e?.message || String(e) }]; }
    if (echecsStock.length) console.error('[orders PUT] sortie de stock incomplète', before.order_number, echecsStock);
  }

  const newStatus = data?.status;
  const triggerStatuses = ['shipped', 'delivered', 'confirmed'];

  /* ── Expedition partielle ──────────────────────────────────────
     Traitee a part des declencheurs ci-dessous : le client recoit un
     colis, il doit avoir son suivi et savoir ce qui reste a venir. Mais
     la facture, elle, n'a pas a etre emise a ce moment-la — elle suivra
     au solde, sur le statut « expediee ». */
  if (newStatus === 'partial' && newStatus !== prevStatus && data?.customer_email) {
    try {
      const cfg = await getWhiteLabelConfig();
      const fromEmail = (cfg.email_from as string) || (cfg as any).smtp_from || '';
      const mail = await expeditionEmail({ ...data, ...body });
      await sendEmail({ from: fromEmail, to: data.customer_email, subject: mail.sujet, html: mail.html }, cfg);
    } catch (e) {
      /* Un email qui ne part pas ne doit pas annuler l'expedition : le
         colis est deja parti, le stock deja decremente. */
      console.error('[orders] email d expedition partielle :', e);
    }
  }

  // ── Déclencheurs au changement de statut ────────────────────────
  if (newStatus && newStatus !== prevStatus && triggerStatuses.includes(newStatus)) {
    const order = data;

    // 1. Créer la facture si elle n'existe pas encore
    let invoice: any = null;
    const { data: existingInv } = await supabaseAdmin
      .from('invoices').select('id, number').eq('order_id', params.id).maybeSingle();

    if (!existingInv) {
      invoice = await createInvoiceFromOrder({ ...order, status: newStatus });
    } else {
      invoice = existingInv;
    }

    // 2. Sync compta automatique (évite le clic manuel)
    const { data: existingEntry } = await supabaseAdmin
      .from('accounting_entries')
      .select('id').eq('reference_type', 'order').eq('reference_id', params.id).maybeSingle();

    if (!existingEntry) {
      const category = order.source === 'manual' ? 'vente_directe' : 'vente_en_ligne';
      try {
        await supabaseAdmin.from('accounting_entries').insert({
          // Jour de Paris : une commande de 0 h 30 le 1er janvier n'est pas de l'année précédente.
          date:             new Date(order.created_at || Date.now()).toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' }),
          type:             'income',
          category,
          description:      `Commande ${order.order_number}${order.customer_name ? ' — ' + order.customer_name : ''}`,
          amount:           order.total || 0,
          reference_type:   'order',
          reference_id:     params.id,
          reference_number: order.order_number,
        });
      } catch { /* non bloquant */ }
    }

    // 3. Emails client : suivi à l'expédition, remerciement + avis à la livraison
    if (newStatus === 'shipped' && order.customer_email && invoice) {
      try {
        const cfg = await getWhiteLabelConfig();
        const fromEmail = cfg.smtp_from || process.env.SMTP_FROM || process.env.RESEND_FROM || '';
        const mail = await expeditionEmail({ ...order, ...body });
        await sendEmail({ from: fromEmail, to: order.customer_email, subject: mail.sujet, html: mail.html }, cfg);
      } catch (emailErr) {
        console.error('[orders PUT] email error:', emailErr);
      }
    }

    /* « Livrée » = entre les mains du client, quel que soit le mode :
       retrait à l'atelier, retrait en point relais (l'avis de mise à
       disposition est envoyé par Mondial Relay lui-même), ou domicile.
       Gabarit de la boutique, avec la demande d'avis Google. */
    if (newStatus === 'delivered') {
      try { await envoyerEmailLivraison(order); }
      catch (emailErr) { console.error('[orders PUT] email de livraison :', emailErr); }
    }
  }

  return NextResponse.json({ order: data, ...(echecsStock.length ? { echecs_stock: echecsStock } : {}) });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401, headers: CORS });
  await supabaseAdmin.from('orders').update({ status: 'cancelled' }).eq('id', params.id);
  return NextResponse.json({ success: true });
}
