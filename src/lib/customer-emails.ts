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
