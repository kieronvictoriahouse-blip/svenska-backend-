import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { verifyChoice } from '@/lib/replacement-token';

/* ── Marque de l'instance ────────────────────────────────────────
   Cette page est la seule du back vue par le CLIENT FINAL (le lien de
   remplacement dans son email) : elle doit porter la marque du
   marchand, jamais une adresse en dur. Chargée à chaque requête —
   valeur identique pour toute l'instance, le partage de module entre
   requêtes concurrentes est donc sans conséquence. */
let MARQUE = { nom: '', email: '' };
async function chargerMarque() {
  try {
    const { data } = await supabaseAdmin
      .from('white_label_config').select('site_name, email, smtp_user').limit(1).maybeSingle();
    MARQUE = {
      nom: (data as any)?.site_name || '',
      email: (data as any)?.email || (data as any)?.smtp_user || '',
    };
  } catch { /* page utilisable sans marque */ }
}
const lienContact = () => MARQUE.email
  ? `<a href="mailto:${MARQUE.email}" style="color:#44573D;">${MARQUE.email}</a>`
  : 'notre adresse de contact habituelle';

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
<title>${titre}${MARQUE.nom ? ' — ' + MARQUE.nom : ''}</title></head>
<body style="margin:0;background:${D.cream};font-family:Arial,Helvetica,sans-serif;color:${D.body};">
  <div style="max-width:560px;margin:0 auto;padding:48px 20px;">
    <div style="background:${D.paper};border:1px solid ${D.rule};">
      <div style="height:7px;background:${accent};"></div>
      <div style="height:2px;background:${D.gold};"></div>
      <div style="padding:36px 34px;">
        <div style="font-size:10px;letter-spacing:2.6px;color:${D.gold};font-weight:bold;">${MARQUE.nom.toUpperCase().split(' ')[0] || ''} CRAVINGS</div>
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


/** Page de composition : le client repartit lui-meme ses unites.
 *  Un clic ne suffit pas pour panacher — il faut un formulaire. */
function pageComposer(
  c: any, token: string, options: any[], dispos: Record<string, number | null>,
) {
  const qte = Number(c.line_qty) || 1;
  /* Le plafond de chaque champ, c'est le plus petit des deux : ce qu'il
     reste à répartir, et ce qu'on a réellement. Laisser le client saisir
     un nombre qu'on refusera ensuite, c'est lui faire remplir un
     formulaire pour rien. */
  const reste = (o: any) => {
    const d = dispos[String(o.product_id)];
    return d === null || d === undefined ? qte : Math.min(qte, Math.max(0, d));
  };
  const lignes = options.map((o, i) => `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid ${D.rule};">
        <div style="font-size:15px;color:${D.ink};">${echap(o.nom)}</div>
        ${o.note ? `<div style="font-size:12px;color:${D.body};padding-top:2px;">${echap(o.note)}</div>` : ''}
        ${reste(o) < qte ? `<div style="font-size:12px;color:#B03A2E;padding-top:2px;">Il ne nous en reste que ${reste(o)}</div>` : ''}
      </td>
      <td style="padding:12px 0;border-bottom:1px solid ${D.rule};text-align:right;white-space:nowrap;">
        <input type="number" name="q_${echap(String(o.product_id))}" value="0" min="0" max="${reste(o)}"
               inputmode="numeric" class="q"
               style="width:62px;height:38px;text-align:center;font-size:16px;border:1px solid ${D.rule};background:#fff;color:${D.ink};" />
      </td>
    </tr>`).join('');

  return page('Composez votre remplacement', `
    Vous aviez commandé <strong>${qte} × ${echap(c.line_name)}</strong>.
    Répartissez ces ${qte} unités comme vous voulez — une de chaque, ou tout sur un seul.
    <form method="POST" action="/api/remplacement" style="padding-top:18px;">
      <input type="hidden" name="token" value="${echap(token)}" />
      <table style="width:100%;border-collapse:collapse;">${lignes}</table>
      <div style="padding:16px 0 4px;font-size:14px;color:${D.body};">
        Total réparti : <strong id="tot" style="color:${D.ink};">0</strong> / ${qte}
      </div>
      <button type="submit" id="go" disabled
              style="width:100%;height:48px;margin-top:10px;border:0;background:${D.green};color:#fff;font-size:15px;cursor:pointer;">
        Valider mon choix
      </button>
      <div style="font-size:12.5px;color:${D.body};padding-top:12px;line-height:20px;">
        L’écart de prix est pour nous — c’est nous qui sommes en rupture, pas vous.
      </div>
    </form>
    <script>
      (function () {
        var champs = [].slice.call(document.querySelectorAll('.q'));
        var tot = document.getElementById('tot'), go = document.getElementById('go');
        function maj() {
          var n = champs.reduce(function (s, c) { return s + (parseInt(c.value, 10) || 0); }, 0);
          tot.textContent = n;
          var ok = n === ${qte};
          go.disabled = !ok;
          go.style.opacity = ok ? '1' : '.45';
          go.style.cursor = ok ? 'pointer' : 'not-allowed';
        }
        champs.forEach(function (c) { c.addEventListener('input', maj); });
        maj();
      })();
    </script>`);
}

/** Le nom d'un produit vient de la base : on l'echappe avant de l'ecrire
 *  dans une page HTML. */
function echap(v: unknown) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function GET(req: NextRequest) {
  await chargerMarque();
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token') || '';
  const choix = searchParams.get('choix') || '';

  const v = verifyChoice(token);
  if (!v.ok) {
    const msg = v.raison === 'expire'
      ? `Ce lien a expiré. Écrivez-nous à ${lienContact()} et nous reprenons la main tout de suite.`
      : `Ce lien n’est pas valide. Vérifiez que vous l’avez ouvert entièrement depuis votre email, ou écrivez-nous à ${lienContact()}.`;
    return page('Lien inutilisable', msg, 'ko');
  }

  const { data: c } = await supabaseAdmin
    .from('order_line_choices').select('*').eq('id', v.payload.cid).maybeSingle();
  if (!c) return page('Demande introuvable', 'Cette demande n’existe plus. Écrivez-nous et nous la reprenons.', 'ko');
  if (c.order_id !== v.payload.oid) {
    return page('Lien inutilisable', 'Ce lien ne correspond pas à la commande attendue.', 'ko');
  }
  if (c.status !== 'pending') return dejaDecide(c);

  /* ── Composer soi-meme sa repartition ─────────────────────── */
  if (choix === 'composer') {
    const options: any[] = Array.isArray(c.options) ? c.options : [];
    if (!options.length) {
      return page('Rien à composer', 'Aucune proposition n’accompagne cette demande.', 'ko');
    }
    /* Le disponible se relit à l'ouverture de la page : les stocks ont
        bougé depuis l'envoi de l'email. */
    const { disponiblesPour } = await import('@/lib/reserve');
    const dispos = await disponiblesPour(options.map(o => String(o.product_id)));
    return pageComposer(c, token, options, dispos);
  }

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

  /* Le stock se vérifie AU CLIC, pas à l'envoi de l'email. Entre les
     deux, des jours passent et d'autres commandes tombent : ce qui
     était proposable ne l'est plus forcément.
     On oppose le DISPONIBLE, jamais le rayon — une partie de ce qui est
     là appartient déjà à quelqu'un, parfois au client lui-même. */
  const { disponiblesPour } = await import('@/lib/reserve');
  const dispo1 = (await disponiblesPour([prod.id]))[prod.id];
  if (dispo1 !== null && dispo1 < qte) {
    return page('Nous n’en avons plus assez',
      `Il ne nous reste que <strong>${Math.max(0, dispo1)}</strong> ${prod.name_fr} pour votre commande,
       et il vous en faut ${qte}. Nous préférons vous le dire que vous l'annoncer après coup.
       Répondez à cet email : nous vous proposons autre chose ou nous vous remboursons cette ligne.`, 'ko');
  }

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

/* ═══════════════════════════════════════════════════════════════
   VALIDATION D'UNE RÉPARTITION — ROUTE PUBLIQUE

   Mêmes précautions que le clic simple, et une de plus : les quantités
   viennent d'un formulaire, donc de l'extérieur. On les replafonne, on
   vérifie que leur somme fait exactement la quantité commandée, et on
   n'accepte que des articles réellement proposés dans l'email.
   ═══════════════════════════════════════════════════════════════ */
export async function POST(req: NextRequest) {
  await chargerMarque();
  const form = await req.formData().catch(() => null);
  if (!form) return page('Formulaire illisible', 'Réessayez depuis le lien de votre email.', 'ko');

  const token = String(form.get('token') || '');
  const v = verifyChoice(token);
  if (!v.ok) {
    return page('Lien inutilisable',
      `Ce lien n’est plus valide. Écrivez-nous à ${lienContact()}.`, 'ko');
  }

  const { data: c } = await supabaseAdmin
    .from('order_line_choices').select('*').eq('id', v.payload.cid).maybeSingle();
  if (!c) return page('Demande introuvable', 'Cette demande n’existe plus.', 'ko');
  if (c.order_id !== v.payload.oid) {
    return page('Lien inutilisable', 'Ce lien ne correspond pas à la commande attendue.', 'ko');
  }
  if (c.status !== 'pending') return dejaDecide(c);

  const qteTotale = Number(c.line_qty) || 1;
  const options: any[] = Array.isArray(c.options) ? c.options : [];

  /* On ne lit que les articles proposés : un champ ajouté à la main dans
     le formulaire ne peut pas faire entrer un autre produit. */
  const demande: Array<{ product_id: string; qte: number }> = [];
  for (const o of options) {
    const n = Math.max(0, Math.round(Number(form.get(`q_${o.product_id}`)) || 0));
    if (n > 0) demande.push({ product_id: String(o.product_id), qte: n });
  }

  const somme = demande.reduce((s, d) => s + d.qte, 0);
  if (somme !== qteTotale) {
    return page('Répartition incomplète',
      `Vous avez réparti ${somme} unité(s) sur ${qteTotale}. Revenez en arrière et ajustez —
       le total doit tomber juste pour que nous préparions le bon colis.`, 'ko');
  }

  /* Les prix viennent du catalogue, jamais du formulaire. */
  const { data: prods } = await supabaseAdmin
    .from('products').select('id, name_fr, price').in('id', demande.map(d => d.product_id));
  const parId = Object.fromEntries((prods || []).map(p => [p.id, p]));

  const manquant = demande.find(d => !parId[d.product_id]);
  if (manquant) {
    return page('Article indisponible',
      'Une des propositions n’est plus disponible. Écrivez-nous et nous trouvons autre chose.', 'ko');
  }

  /* Même contrôle que sur le choix simple, article par article : un
     panachage peut tenir dans le total et dépasser sur une ligne. */
  const { disponiblesPour } = await import('@/lib/reserve');
  const dispos = await disponiblesPour(demande.map(d => d.product_id));
  const trop = demande.filter(d => {
    const dp = dispos[d.product_id];
    return dp !== null && dp < d.qte;
  });
  if (trop.length) {
    const detail = trop.map(d =>
      `<li>${parId[d.product_id].name_fr} — vous en demandez ${d.qte}, il nous en reste ${Math.max(0, dispos[d.product_id] as number)}</li>`
    ).join('');
    return page('Nous n’en avons plus assez',
      `<ul style="text-align:left;margin:0 0 12px;padding-left:20px">${detail}</ul>
       Revenez en arrière et ajustez votre répartition. Si rien ne convient, répondez à cet
       email : nous vous proposons autre chose ou nous vous remboursons cette ligne.`, 'ko');
  }

  const mix = demande.map(d => ({
    product_id: d.product_id,
    nom: parId[d.product_id].name_fr,
    qte: d.qte,
    prix: Number(parId[d.product_id].price) || 0,
  }));

  const ancien = qteTotale * (Number(c.line_price) || 0);
  const nouveau = mix.reduce((s, m) => s + m.qte * m.prix, 0);
  const delta = ancien - nouveau;   // > 0 : la boutique doit la différence

  const resume = mix.map(m => `${m.qte} × ${m.nom}`).join(', ');

  await supabaseAdmin.from('order_line_choices').update({
    status: 'replaced',
    chosen_mix: mix,
    /* Renseigné aussi quand le panachage tient sur un seul article : le
       back-office et les écrans existants continuent de fonctionner. */
    chosen_product_id: mix.length === 1 ? mix[0].product_id : null,
    chosen_label: resume,
    price_delta: delta,
    decided_at: new Date().toISOString(),
  }).eq('id', c.id);

  const mot = delta > 0
    ? `La différence de <strong>${eur(delta)}</strong> vous est remboursée — c’est nous qui sommes en rupture, pas vous.`
    : delta < 0
      ? 'La différence de prix est pour nous, vous n’avez rien de plus à régler.'
      : 'Le prix est identique, il n’y a rien à régulariser.';

  return page('Parfait, c’est noté',
    `À la place de <strong>${echap(c.line_name)}</strong>, nous mettons dans votre colis :<br /><br />
     <strong>${echap(resume)}</strong><br /><br />
     ${mot}<br /><br />
     Nous préparons votre commande et vous prévenons dès qu’elle part.`);
}
