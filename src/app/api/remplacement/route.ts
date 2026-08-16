import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { verifyChoice } from '@/lib/replacement-token';

export const dynamic = 'force-dynamic';

/* ═══════════════════════════════════════════════════════════════
   RÉPONSE DU CLIENT — ROUTE PUBLIQUE

   Appelée depuis un lien reçu par email, sans session. Le jeton signé
   est la seule authentification, d'où les précautions :

   — le montant n'est jamais lu depuis l'URL, il est recalculé depuis
     le catalogue au moment du clic ;
   — l'opération est idempotente : recliquer n'ajoute rien, on réaffiche
     simplement la décision déjà prise ;
   — aucun mouvement d'argent n'est déclenché ici. Un remboursement
     reste validé à la main depuis le back-office. Une route publique
     qui rembourse toute seule est une route publique qu'on attaque.
   ═══════════════════════════════════════════════════════════════ */

const D = {
  paper: '#FDFBF5', cream: '#F4EEE1', green: '#44573D', gold: '#B49256',
  ink: '#1F231C', body: '#5F5A4E', rule: '#E3DCCB',
};

function page(titre: string, corps: string, ton: 'ok' | 'ko' = 'ok') {
  const accent = ton === 'ok' ? D.green : '#A84234';
  return new NextResponse(
    `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${titre} — Swedish Cravings</title></head>
<body style="margin:0;background:${D.cream};font-family:Arial,Helvetica,sans-serif;color:${D.body};">
  <div style="max-width:560px;margin:0 auto;padding:48px 20px;">
    <div style="background:${D.paper};border:1px solid ${D.rule};">
      <div style="height:7px;background:${accent};"></div>
      <div style="height:2px;background:${D.gold};"></div>
      <div style="padding:36px 34px;">
        <div style="font-size:10px;letter-spacing:2.6px;color:${D.gold};font-weight:bold;">SWEDISH CRAVINGS</div>
        <h1 style="font-family:Georgia,serif;font-size:28px;line-height:34px;color:${D.ink};margin:12px 0 0;font-weight:normal;">${titre}</h1>
        <div style="font-size:15px;line-height:25px;padding-top:14px;">${corps}</div>
      </div>
    </div>
  </div>
</body></html>`,
    { status: ton === 'ok' ? 200 : 400, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
  );
}

const eur = (n: number) =>
  (Number(n) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

/** Réaffichage d'une décision déjà enregistrée — le client a recliqué. */
function dejaDecide(c: any) {
  const quoi =
    c.status === 'replaced' ? `remplacé par <strong>${c.chosen_label}</strong>`
    : c.status === 'refund_requested' ? 'retiré de votre commande, avec remboursement'
    : 'mis en attente du réassort';
  return page('C’est déjà noté',
    `Votre choix a bien été enregistré : l’article <strong>${c.line_name}</strong> sera ${quoi}.<br /><br />
     Vous n’avez rien d’autre à faire — inutile de recliquer, votre réponse ne compte qu’une fois.`);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token') || '';
  const choix = searchParams.get('choix') || '';

  const v = verifyChoice(token);
  if (!v.ok) {
    const msg = v.raison === 'expire'
      ? 'Ce lien a expiré. Écrivez-nous à <a href="mailto:hej@swedishcravings.fr" style="color:#44573D;">hej@swedishcravings.fr</a> et nous reprenons la main tout de suite.'
      : 'Ce lien n’est pas valide. Vérifiez que vous l’avez ouvert entièrement depuis votre email, ou écrivez-nous à <a href="mailto:hej@swedishcravings.fr" style="color:#44573D;">hej@swedishcravings.fr</a>.';
    return page('Lien inutilisable', msg, 'ko');
  }

  const { data: c } = await supabaseAdmin
    .from('order_line_choices').select('*').eq('id', v.payload.cid).maybeSingle();
  if (!c) return page('Demande introuvable', 'Cette demande n’existe plus. Écrivez-nous et nous la reprenons.', 'ko');
  if (c.order_id !== v.payload.oid) {
    return page('Lien inutilisable', 'Ce lien ne correspond pas à la commande attendue.', 'ko');
  }
  if (c.status !== 'pending') return dejaDecide(c);

  /* ── Attendre le réassort ─────────────────────────────────── */
  if (choix === 'attendre') {
    await supabaseAdmin.from('order_line_choices')
      .update({ status: 'waiting', chosen_label: 'Attente du réassort', decided_at: new Date().toISOString() })
      .eq('id', c.id);
    return page('Entendu, on vous attend',
      `Nous gardons votre commande complète et l’expédions dès l’arrivée du réassort de
       <strong>${c.line_name}</strong>. Vous recevrez un email avec la date exacte dès que le camion est arrivé.`);
  }

  /* ── Retrait + remboursement ──────────────────────────────── */
  if (choix === 'rembourser') {
    const du = Number(c.line_qty || 1) * Number(c.line_price || 0);
    await supabaseAdmin.from('order_line_choices')
      .update({
        status: 'refund_requested',
        chosen_label: 'Retrait et remboursement',
        // Négatif : c'est la boutique qui doit cette somme.
        price_delta: -du,
        decided_at: new Date().toISOString(),
      })
      .eq('id', c.id);
    return page('C’est noté, on vous rembourse',
      `Nous retirons <strong>${c.line_name}</strong> de votre commande et vous remboursons
       <strong>${eur(du)}</strong> sur le moyen de paiement d’origine. Le reste de votre commande suit son cours.<br /><br />
       Le remboursement apparaît sur votre relevé sous quelques jours.`);
  }

  /* ── Remplacement par un autre article ────────────────────── */
  const options: any[] = Array.isArray(c.options) ? c.options : [];
  const opt = options.find(o => String(o.product_id) === choix);
  if (!opt) return page('Choix inconnu', 'Cette proposition ne fait pas partie de celles envoyées.', 'ko');

  /* Le prix vient du catalogue, jamais de l'email ni du lien : entre
     l'envoi et le clic, il a pu changer. */
  const { data: prod } = await supabaseAdmin
    .from('products').select('id, name_fr, price').eq('id', opt.product_id).maybeSingle();
  if (!prod) return page('Article indisponible',
    'Cette proposition n’est plus disponible. Écrivez-nous et nous trouvons autre chose.', 'ko');

  const qte = Number(c.line_qty) || 1;
  const ancien = qte * (Number(c.line_price) || 0);
  const nouveau = qte * (Number(prod.price) || 0);
  const delta = ancien - nouveau;   // > 0 : la boutique doit la différence

  await supabaseAdmin.from('order_line_choices')
    .update({
      status: 'replaced',
      chosen_product_id: prod.id,
      chosen_label: prod.name_fr,
      price_delta: delta,
      decided_at: new Date().toISOString(),
    })
    .eq('id', c.id);

  const mot = delta > 0
    ? `La différence de <strong>${eur(delta)}</strong> vous est remboursée — c’est nous qui sommes en rupture, pas vous.`
    : delta < 0
      ? 'La différence de prix est pour nous, vous n’avez rien de plus à régler.'
      : 'Le prix est identique, il n’y a rien à régulariser.';

  return page('Parfait, c’est remplacé',
    `<strong>${c.line_name}</strong> est remplacé par <strong>${prod.name_fr}</strong> dans votre commande.<br /><br />
     ${mot}<br /><br />
     Nous préparons votre colis et vous prévenons dès qu’il part.`);
}
