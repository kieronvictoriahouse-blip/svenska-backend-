import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const parse = (v: any): any[] => {
  try { return typeof v === 'string' ? JSON.parse(v) : (Array.isArray(v) ? v : []); }
  catch { return []; }
};
const r2 = (n: any) => Math.round((Number(n) || 0) * 100) / 100;

/** Demandes de remplacement : en attente, puis réponses reçues. */
export async function GET(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const { data: rows } = await supabaseAdmin
    .from('order_line_choices').select('*').order('created_at', { ascending: false }).limit(200);

  const ids = Array.from(new Set((rows || []).map(r => r.order_id)));
  const { data: orders } = await supabaseAdmin
    .from('orders').select('id, order_number, customer_name, customer_email, status, total')
    .in('id', ids.length ? ids : ['-']);
  const byId = Object.fromEntries((orders || []).map(o => [o.id, o]));

  return NextResponse.json({
    ruptures: (rows || []).map(r => ({ ...r, order: byId[r.order_id] || null })),
  });
}

/**
 * Applique le choix du client à la commande, ou clôt la demande.
 *
 * La route publique enregistre la réponse mais ne touche jamais à la
 * commande : un lien reçu par email ne doit pas pouvoir réécrire une
 * vente. C'est ici, après ton contrôle, que le changement est fait.
 *
 * Le remboursement reste à part : il passe par /api/orders/[id]/refund
 * depuis la fiche commande, avec son écran et ses garde-fous.
 */
export async function PUT(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const { id, action } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: 'Identifiant manquant' }, { status: 400 });

  if (action === 'clore') {
    const { error } = await supabaseAdmin
      .from('order_line_choices').update({ status: 'done' }).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  /* ── Relance ──────────────────────────────────────────────────
     On renvoie EXACTEMENT le meme email, avec le meme jeton : celui-ci
     est un HMAC de (demande, commande), donc deterministe. Le premier
     lien recu par le client reste valide — le relancer ne doit pas
     invalider ce qu'il a peut-etre deja ouvert. */
  if (action === 'relancer') {
    const { data: choix } = await supabaseAdmin
      .from('order_line_choices').select('*').eq('id', id).maybeSingle();
    if (!choix) return NextResponse.json({ error: 'Demande introuvable' }, { status: 404 });
    if (['done', 'replaced', 'refund_requested', 'waiting'].includes(choix.status)) {
      return NextResponse.json(
        { error: 'Le client a déjà répondu — inutile de relancer.' }, { status: 409 });
    }

    const { data: order } = await supabaseAdmin
      .from('orders').select('*').eq('id', choix.order_id).maybeSingle();
    if (!order?.customer_email) {
      return NextResponse.json({ error: 'Email client manquant' }, { status: 400 });
    }

    const { signChoice } = await import('@/lib/replacement-token');
    const { ruptureEmail } = await import('@/lib/customer-emails');
    const { sendEmail, getWhiteLabelConfig } = await import('@/lib/email-send');

    const cfg = await getWhiteLabelConfig();
    const from = cfg.smtp_from || process.env.SMTP_FROM || process.env.RESEND_FROM || '';

    const mail = await ruptureEmail(order, {
      choice: choix,
      token: signChoice(choix.id, order.id),
      titre: 'Petit rappel — un article de votre commande est en rupture',
      corps: '',
      baseUrl: process.env.NEXT_PUBLIC_BACKEND_URL || 'https://admin.swedishcravings.fr',
    });

    try {
      await sendEmail({ from, to: order.customer_email, subject: mail.sujet, html: mail.html }, cfg);
    } catch (e: any) {
      /* L'echec est ecrit sur la demande : sans ca, il ne resterait
         qu'un message fugace a l'ecran et plus aucune trace demain. */
      await supabaseAdmin.from('order_line_choices')
        .update({ last_send_error: String(e?.message || e).slice(0, 300) }).eq('id', id);
      return NextResponse.json({ error: `Envoi refusé : ${e?.message || e}` }, { status: 502 });
    }

    const { data: maj } = await supabaseAdmin.from('order_line_choices').update({
      last_sent_at: new Date().toISOString(),
      relances: (Number(choix.relances) || 0) + 1,
      last_send_error: null,
    }).eq('id', id).select().single();

    return NextResponse.json({
      ok: true,
      relances: maj?.relances ?? null,
      destinataire: order.customer_email,
    });
  }

  if (action !== 'appliquer') {
    return NextResponse.json({ error: 'Action inconnue' }, { status: 400 });
  }

  const { data: choix } = await supabaseAdmin
    .from('order_line_choices').select('*').eq('id', id).maybeSingle();
  if (!choix) return NextResponse.json({ error: 'Demande introuvable' }, { status: 404 });
  if (choix.status !== 'replaced') {
    return NextResponse.json({
      error: 'Seul un remplacement s’applique ici. Un remboursement se fait depuis la fiche commande.',
    }, { status: 400 });
  }

  const { data: order } = await supabaseAdmin
    .from('orders').select('*').eq('id', choix.order_id).maybeSingle();
  if (!order) return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 });

  /* Le client a pu panacher : une ligne remplacee par plusieurs. On
     ramene les deux cas au meme format pour n'ecrire qu'un seul chemin. */
  const mix: Array<{ product_id: string; nom: string; qte: number; prix: number }> =
    Array.isArray(choix.chosen_mix) && choix.chosen_mix.length
      ? choix.chosen_mix
      : [];

  if (!mix.length) {
    const { data: remplacant } = await supabaseAdmin
      .from('products').select('id, name_fr, price').eq('id', choix.chosen_product_id).maybeSingle();
    if (!remplacant) return NextResponse.json({ error: 'Article de remplacement introuvable' }, { status: 404 });
    mix.push({
      product_id: remplacant.id, nom: remplacant.name_fr,
      qte: Number(choix.line_qty) || 1, prix: Number(remplacant.price) || 0,
    });
  }

  /* On remplace la ligne, sans toucher au total : la boutique absorbe
     l'écart, c'est ce que dit l'email au client. Un trop-perçu se
     rembourse séparément, avec sa trace comptable. */
  const lignes = parse(order.lines);
  const idx = lignes.findIndex((l: any) =>
    (choix.product_id && l.product_id === choix.product_id) || l.name === choix.line_name);
  if (idx === -1) {
    return NextResponse.json({ error: 'Ligne introuvable dans la commande' }, { status: 409 });
  }

  const ancienne = lignes[idx];
  /* Le prix paye ne change pas : le client a regle l'ancien article, et
     la boutique absorbe l'ecart. Sur un panachage, chaque nouvelle ligne
     garde donc le prix unitaire d'origine — le total de la commande est
     inchange, ce qui est exactement ce que l'email a promis. */
  const nouvelles = mix.map(m => ({
    ...ancienne,
    product_id: m.product_id,
    name: m.nom,
    qty: m.qte,
    price: Number(ancienne.price) || 0,
    remplace: choix.line_name,
  }));
  lignes.splice(idx, 1, ...nouvelles);

  const { error: majErr } = await supabaseAdmin.from('orders').update({
    lines: JSON.stringify(lignes),
    updated_at: new Date().toISOString(),
  }).eq('id', order.id);
  if (majErr) return NextResponse.json({ error: majErr.message }, { status: 500 });

  /* Le stock suit : l'article manquant revient, le remplaçant sort.
     Sans ça, la commande dirait une chose et le stock une autre. */
  const { adjustStock } = await import('@/lib/stock');
  const qte = Number(choix.line_qty) || 1;
  const ref = `RUPT-${order.order_number}`;
  try {
    if (choix.product_id) {
      await adjustStock(choix.product_id, qte, {
        reason: 'replacement', reference: ref,
        note: `Article en rupture remis en stock — remplacé par ${mix.map(m => m.nom).join(', ')}`,
      });
    }
    for (const m of mix) {
      await adjustStock(m.product_id, -m.qte, {
        reason: 'replacement', reference: ref,
        note: `Remplace ${choix.line_name} sur ${order.order_number}`,
      });
    }
  } catch (e) {
    console.error('[ruptures] stock non ajusté', e);
  }

  await supabaseAdmin.from('order_line_choices').update({ status: 'done' }).eq('id', id);

  const du = r2(choix.price_delta);
  return NextResponse.json({
    ok: true,
    remboursement_du: du > 0 ? du : 0,
    message: du > 0
      ? `Ligne remplacée. Il reste ${du.toFixed(2)} € à rembourser depuis la fiche commande.`
      : 'Ligne remplacée, rien à rembourser.',
  });
}
