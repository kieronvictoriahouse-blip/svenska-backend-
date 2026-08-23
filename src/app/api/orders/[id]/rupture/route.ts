import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';
import { sendEmail, getWhiteLabelConfig } from '@/lib/email-send';
import { signChoice } from '@/lib/replacement-token';
import { ruptureEmail } from '@/lib/customer-emails';

export const dynamic = 'force-dynamic';

/* Signale une rupture au client et lui propose des remplacements.
   Corps attendu :
   { line: { product_id, name, qty, price, ref? },
     options: [product_id…],           // proposés au choix
     titre?, corps? }                  // texte libre de l'expéditrice */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const line = body.line || {};
  const optionIds: string[] = Array.isArray(body.options) ? body.options : [];
  if (!line.name) return NextResponse.json({ error: 'Ligne en rupture manquante' }, { status: 400 });

  const { data: order } = await supabaseAdmin
    .from('orders').select('*').eq('id', params.id).maybeSingle();
  if (!order) return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 });
  if (!order.customer_email) return NextResponse.json({ error: 'Email client manquant' }, { status: 400 });

  // Les propositions sont figées au moment de l'envoi, mais le prix sera
  // recalculé au clic : ici c'est de l'affichage.
  const { data: prods } = await supabaseAdmin
    .from('products').select('id, name_fr, price, subtitle_fr').in('id', optionIds.length ? optionIds : ['-']);

  const qte = Number(line.qty) || 1;
  const pu = Number(line.price) || 0;

  /* On ne propose pas ce qu'on n'a pas. Le disponible — rayon moins ce
     qui est déjà dû — et non le stock brut : une partie de ce qui est en
     rayon appartient déjà à quelqu'un, parfois au client qu'on écrit.
     Un article qu'on ne peut pas fournir en entier reste proposable : le
     client peut panacher, et la page de choix plafonne chaque ligne. Ce
     qui est refusé ici, c'est le zéro — proposer un article épuisé pour
     remplacer un article épuisé. */
  const { disponiblesPour } = await import('@/lib/reserve');
  const dispos = await disponiblesPour(optionIds);
  const retenus = (prods || []).filter(p => {
    const d = dispos[p.id];
    return d === null || d > 0;
  });
  if (optionIds.length && !retenus.length) {
    return NextResponse.json({
      error: 'Aucune des propositions n’est disponible — elles sont toutes épuisées ou déjà réservées à d’autres commandes.',
    }, { status: 409 });
  }

  const { data: choice, error } = await supabaseAdmin.from('order_line_choices').insert({
    order_id: order.id,
    product_id: line.product_id || null,
    line_ref: line.ref || null,
    line_name: line.name,
    line_qty: qte,
    line_price: pu,
    options: retenus.map(p => ({
      product_id: p.id, nom: p.name_fr, prix: Number(p.price) || 0, note: p.subtitle_fr || '',
    })),
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  /* La ligne est deja inserte — le jeton a besoin de son identifiant. Si
     la signature echoue (secret absent), il resterait une demande qui a
     l'air envoyee alors qu'aucun email n'est parti. On la retire. */
  let token: string;
  try {
    token = signChoice(choice.id, order.id);
  } catch (e: any) {
    await supabaseAdmin.from('order_line_choices').delete().eq('id', choice.id);
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
  const cfg = await getWhiteLabelConfig();
  const from = cfg.smtp_from || process.env.SMTP_FROM || process.env.RESEND_FROM || '';

  const mail = await ruptureEmail(order, {
    choice, token,
    titre: body.titre || 'Un article vient de partir en rupture',
    corps: body.corps || '',
    baseUrl: process.env.NEXT_PUBLIC_BACKEND_URL || '',
  });

  /* `sent_at` est pose par DEFAUT a l'insertion, donc avant l'envoi : il
     dit qu'une demande existe, pas qu'un email est parti. `last_sent_at`
     n'est ecrit qu'apres un envoi accepte par le serveur. */
  try {
    await sendEmail({ from, to: order.customer_email, subject: mail.sujet, html: mail.html }, cfg);
  } catch (e: any) {
    await supabaseAdmin.from('order_line_choices')
      .update({ last_send_error: String(e?.message || e).slice(0, 300) }).eq('id', choice.id);
    return NextResponse.json(
      { error: `Demande créée, mais l'email n'est pas parti : ${e?.message || e}`, choice_id: choice.id },
      { status: 502 });
  }

  await supabaseAdmin.from('order_line_choices')
    .update({ last_sent_at: new Date().toISOString() }).eq('id', choice.id);

  return NextResponse.json({ ok: true, choice_id: choice.id, destinataire: order.customer_email });
}
