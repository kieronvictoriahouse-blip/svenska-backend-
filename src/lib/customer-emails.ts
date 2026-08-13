import { renderEmail } from '@/lib/email-templates';

/* ═══════════════════════════════════════════════════════════════
   CONTEXTES DES EMAILS CLIENTS

   Un seul endroit qui traduit une commande / une facture en variables
   de gabarit. Les gabarits eux-mêmes ne connaissent pas la base : ils
   ne reçoivent que des chaînes déjà formatées.
   ═══════════════════════════════════════════════════════════════ */

const eur = (n: unknown) =>
  (Number(n) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

const esc = (v: unknown) =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Prénom seul : « Bonjour Stephanie » plutôt que le nom complet. */
export const prenomDe = (nom?: string | null) =>
  String(nom || '').trim().split(/\s+/)[0] || 'à vous';

const parseLines = (v: any): any[] => {
  try { return typeof v === 'string' ? JSON.parse(v) : (Array.isArray(v) ? v : []); }
  catch { return []; }
};

const SHIPPING_WORDS = ['frais de livraison', 'frais de port', 'livraison'];
const isShipping = (l: any) =>
  SHIPPING_WORDS.some(w => String(l?.desc || l?.name || '').toLowerCase().includes(w));

/** Adresse multi-lignes prête à insérer (variable brute `adresse_html`). */
export function adresseHtml(order: any): string {
  const raw = order?.relay_point_address
    ? [order.relay_point_name, order.relay_point_address].filter(Boolean).join(', ')
    : order?.shipping_address;
  const parts = typeof raw === 'string'
    ? raw.split(',').map((s: string) => s.trim()).filter(Boolean)
    : [raw?.line1, raw?.line2, [raw?.postal_code, raw?.city].filter(Boolean).join(' '), raw?.country]
        .filter(Boolean);
  return parts.map(esc).join('<br />');
}

/** Lignes d'articles, hors frais de port. `brut` sert au sous-total. */
function lignesDe(order: any) {
  return parseLines(order?.lines).filter(l => !isShipping(l)).map(l => {
    const qte = Number(l.qty) || 1;
    const pu = Number(l.price ?? l.unit_price) || 0;
    return {
      nom: l.name || l.desc || l.name_fr || 'Article',
      qte: String(qte),
      pu: eur(pu),
      montant: eur(qte * pu),
      brut: qte * pu,
    };
  });
}

const sousTotalDe = (lignes: Array<{ brut: number }>) => lignes.reduce((s, l) => s + l.brut, 0);

/** Confirmation de commande — déclenchée par le paiement accepté. */
export function confirmationCommande(order: any) {
  const lignes = lignesDe(order);
  const sousTotal = sousTotalDe(lignes);
  const livraison = Number(order.shipping) || 0;
  return {
    sujet: `Commande ${order.order_number} confirmée — merci !`,
    html: renderEmail('email-confirmation-commande', {
      prenom: prenomDe(order.customer_name),
      client: order.customer_name || '',
      numero: order.order_number || '',
      lignes,
      sous_total: eur(sousTotal),
      livraison: livraison > 0 ? eur(livraison) : 'Offerte',
      total: eur(order.total),
      adresse_html: adresseHtml(order),
    }),
  };
}

/** Facture — envoyée après encaissement, PDF en pièce jointe. */
export function factureEmail(order: any, invoice: any) {
  const lignes = lignesDe({ lines: invoice?.lines ?? order?.lines });
  const livraison = Number(order?.shipping) || 0;
  const total = Number(invoice?.total_ttc ?? order?.total) || 0;
  return {
    sujet: `Votre facture ${invoice?.number || ''}`.trim(),
    html: renderEmail('email-facture', {
      prenom: prenomDe(invoice?.client_name || order?.customer_name),
      client: invoice?.client_name || order?.customer_name || '',
      numero: order?.order_number || invoice?.order_number || '',
      numero_facture: invoice?.number || '',
      lignes,
      sous_total: eur(total - livraison),
      livraison: livraison > 0 ? eur(livraison) : 'Offerte',
      total: eur(total),
      adresse_html: adresseHtml(order || {}),
    }),
  };
}

/** Avoir / remboursement — émis depuis la facturation. */
export function avoirEmail(avoir: any, factureNumero: string, items: any[] = []) {
  const lignes = (items.length ? items : parseLines(avoir?.lines)).map((l: any) => {
    const qte = Number(l.qty) || 1;
    const pu = Number(l.price ?? l.unit_price) || 0;
    return {
      nom: l.name || l.desc || 'Article', qte: String(qte), pu: eur(pu),
      montant: eur(qte * pu),
      motif: l.motif || l.reason || 'Remboursement',
    };
  });
  return {
    sujet: `Votre remboursement ${avoir?.number || ''}`.trim(),
    html: renderEmail('email-avoir-remboursement', {
      prenom: prenomDe(avoir?.client_name),
      client: avoir?.client_name || '',
      numero_avoir: avoir?.number || '',
      numero_facture: factureNumero || '',
      lignes,
      total: eur(Math.abs(Number(avoir?.total_ttc) || 0)),
    }),
  };
}

/**
 * Rupture de stock avec choix de remplacement.
 * Chaque lien porte le même jeton signé, seul `choix` change : le
 * serveur retrouve la demande par le jeton, jamais par l'URL.
 */
export function ruptureEmail(
  order: any,
  o: { choice: any; token: string; titre: string; corps: string; baseUrl: string },
) {
  /* Le gabarit ecrit `{{ base_lien }}?{{ lien }}` : la base ne porte donc
     pas le « ? », et chaque lien apporte le jeton + le choix. Le « & » est
     laisse brut : l echappement HTML est fait par le moteur de rendu. */
  const base = `${o.baseUrl.replace(/\/$/, '')}/api/remplacement`;
  const jeton = `token=${encodeURIComponent(o.token)}`;
  const qte = Number(o.choice.line_qty) || 1;
  const pu = Number(o.choice.line_price) || 0;

  const options = (o.choice.options || []).map((opt: any) => {
    const ecart = qte * pu - qte * (Number(opt.prix) || 0);
    return {
      nom: opt.nom,
      note: opt.note || '',
      prix: eur(opt.prix),
      // Un écart nul ne s'affiche pas : « − 0,00 € » ne veut rien dire.
      ecart: ecart > 0 ? `− ${eur(ecart)}` : ecart < 0 ? 'Même prix pour vous' : '',
      lien: `${jeton}&choix=${encodeURIComponent(opt.product_id)}`,
    };
  });

  return {
    sujet: `${o.titre} — commande ${order?.order_number || ''}`.trim(),
    html: renderEmail('email-message-libre', {
      prenom: prenomDe(order?.customer_name),
      numero: order?.order_number || '',
      surtitre: `COMMANDE N° ${order?.order_number || ''} · VOTRE AVIS`,
      titre: o.titre,
      corps: o.corps || `En préparant votre colis, je me suis aperçue que le <strong style="color:#1F231C;">${esc(o.choice.line_name)}</strong> était épuisé. Je ne voulais pas retarder votre commande sans vous demander votre avis, alors voici ce que je peux vous proposer à la place.`,
      article: o.choice.line_name,
      article_ref: o.choice.line_ref || '—',
      article_qte: String(qte),
      article_pu: eur(pu),
      article_montant: eur(qte * pu),
      options,
      base_lien: base,
      lien_rembourser: `${jeton}&choix=rembourser`,
      lien_attendre: `${jeton}&choix=attendre`,
      note_ecart: "L'écart de prix est pour nous — c'est nous qui sommes en rupture, pas vous.",
    }),
  };
}

/** Message libre — envoi manuel depuis la fiche commande. */
export function messageLibre(order: any, opts: { surtitre?: string; titre: string; corps: string }) {
  return {
    sujet: opts.titre,
    html: renderEmail('email-message-libre', {
      prenom: prenomDe(order?.customer_name),
      numero: order?.order_number || '',
      surtitre: (opts.surtitre || `Commande n° ${order?.order_number || ''}`).toUpperCase(),
      titre: opts.titre,
      corps: opts.corps,
    }),
  };
}
