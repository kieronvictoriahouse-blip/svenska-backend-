import { renderEmail, sujetPersonnalise, EmailTemplate } from '@/lib/email-templates';
import { LangueClient, langueDeCommande } from '@/lib/langue-client';
import {
  TE, SANS_PRENOM, SUJETS, texte, mentionPaiement, libelleLivraison,
  titreContenu, colisInfo, accrocheAvoir, corpsRupture, titreReliquat, noteReliquat, titrePanache,
  formatEuro, formatDate, formatDateHeure,
} from '@/lib/emails-i18n';

/* ═══════════════════════════════════════════════════════════════
   CONTEXTES DES EMAILS CLIENTS

   Un seul endroit qui traduit une commande / une facture en variables
   de gabarit. Les gabarits eux-mêmes ne connaissent pas la base : ils
   ne reçoivent que des chaînes déjà formatées.

   Chaque fonction reçoit la langue du client — celle déduite de son pays
   de livraison, ou celle choisie à la main sur la commande. Elle n'a
   rien à voir avec la langue du back-office : un Suédois reçoit du
   suédois même si l'on travaille en français.

   Les montants et les dates suivent la même langue. « 1 234,50 € » le
   12 août n'a pas sa place dans un email anglais.
   ═══════════════════════════════════════════════════════════════ */

/* L'objet peut lui aussi etre personnalise depuis le back-office ; sans
   surcharge on garde celui calcule ici, dans la bonne langue. */
async function sujetDe(key: EmailTemplate, defaut: string, lang: LangueClient): Promise<string> {
  return (await sujetPersonnalise(key, lang)) || defaut;
}

const esc = (v: unknown) =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Prénom seul : « Bonjour Stephanie » plutôt que le nom complet. */
export const prenomDe = (nom?: string | null, lang: LangueClient = 'fr') =>
  String(nom || '').trim().split(/\s+/)[0] || SANS_PRENOM[lang];

const parseLines = (v: any): any[] => {
  try { return typeof v === 'string' ? JSON.parse(v) : (Array.isArray(v) ? v : []); }
  catch { return []; }
};

const SHIPPING_WORDS = ['frais de livraison', 'frais de port', 'livraison', 'shipping', 'frakt'];
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

/**
 * Nom d'un article dans la langue du client.
 *
 * Les lignes de commande ne stockent que le nom français. Le nom suédois
 * ou anglais doit donc venir de la fiche produit quand elle est fournie ;
 * sinon on garde le français plutôt que de laisser un blanc.
 */
function nomLigne(l: any, lang: LangueClient, produits?: Record<string, any>): string {
  const p = produits?.[l?.product_id];
  const traduit = lang === 'sv' ? (p?.name_sv || l?.name_sv)
    : lang === 'en' ? (p?.name_en || l?.name_en) : null;
  return traduit || l?.name || l?.desc || l?.name_fr || texte('article', lang);
}

/** Lignes d'articles, hors frais de port. `brut` sert au sous-total. */
function lignesDe(order: any, lang: LangueClient, produits?: Record<string, any>) {
  return parseLines(order?.lines).filter(l => !isShipping(l)).map(l => {
    const qte = Number(l.qty) || 1;
    const pu = Number(l.price ?? l.unit_price) || 0;
    return {
      nom: nomLigne(l, lang, produits),
      qte: String(qte),
      pu: formatEuro(pu, lang),
      montant: formatEuro(qte * pu, lang),
      brut: qte * pu,
    };
  });
}

const sousTotalDe = (lignes: Array<{ brut: number }>) => lignes.reduce((s, l) => s + l.brut, 0);

/** Options communes : la langue peut être imposée (aperçu, renvoi). */
export type OptEmail = { lang?: LangueClient; produits?: Record<string, any>; mentionTva?: string };

const langueDe = (order: any, o?: OptEmail): LangueClient => o?.lang || langueDeCommande(order);

const TVA_DEFAUT = 'TVA non applicable, art. 293 B du CGI';

/** Confirmation de commande — déclenchée par le paiement accepté. */
export async function confirmationCommande(order: any, o: OptEmail = {}) {
  const lang = langueDe(order, o);
  const lignes = lignesDe(order, lang, o.produits);
  const sousTotal = sousTotalDe(lignes);
  const livraison = Number(order.shipping) || 0;
  return {
    lang,
    sujet: await sujetDe('email-confirmation-commande',
      SUJETS.confirmation(order.order_number || '', lang), lang),
    html: await renderEmail('email-confirmation-commande', {
      prenom: prenomDe(order.customer_name, lang),
      client: order.customer_name || '',
      numero: order.order_number || '',
      lignes,
      sous_total: formatEuro(sousTotal, lang),
      livraison: livraison > 0 ? formatEuro(livraison, lang) : texte('offerte', lang),
      libelle_livraison: libelleLivraison(order, lang),
      total: formatEuro(order.total, lang),
      adresse_html: adresseHtml(order),
      /* La date était figée dans le gabarit : toutes les confirmations
         annonçaient un paiement du 12 août 2026. */
      mention_paiement: mentionPaiement(
        order.paid_at || order.created_at, lang, o.mentionTva || TVA_DEFAUT),
    }, lang),
  };
}

/** Facture — envoyée après encaissement, PDF en pièce jointe. */
export async function factureEmail(order: any, invoice: any, o: OptEmail = {}) {
  const lang = langueDe(order, o);
  const lignes = lignesDe({ lines: invoice?.lines ?? order?.lines }, lang, o.produits);
  const livraison = Number(order?.shipping) || 0;
  const total = Number(invoice?.total_ttc ?? order?.total) || 0;
  return {
    lang,
    sujet: await sujetDe('email-facture', SUJETS.facture(invoice?.number || '', lang), lang),
    html: await renderEmail('email-facture', {
      prenom: prenomDe(invoice?.client_name || order?.customer_name, lang),
      client: invoice?.client_name || order?.customer_name || '',
      numero: order?.order_number || invoice?.order_number || '',
      numero_facture: invoice?.number || '',
      lignes,
      sous_total: formatEuro(total - livraison, lang),
      livraison: livraison > 0 ? formatEuro(livraison, lang) : texte('offerte', lang),
      total: formatEuro(total, lang),
      adresse_html: adresseHtml(order || {}),
      // Était figée au 12 août 2026 dans le gabarit.
      date_emission: formatDate(invoice?.date || invoice?.created_at || order?.created_at, lang),
    }, lang),
  };
}

/** Avoir / remboursement — émis depuis la facturation. */
export async function avoirEmail(
  avoir: any, factureNumero: string, items: any[] = [], o: OptEmail = {},
) {
  const lang = o.lang || 'fr';
  const lignes = (items.length ? items : parseLines(avoir?.lines)).map((l: any) => {
    const qte = Number(l.qty) || 1;
    const pu = Number(l.price ?? l.unit_price) || 0;
    return {
      nom: nomLigne(l, lang, o.produits), qte: String(qte), pu: formatEuro(pu, lang),
      montant: formatEuro(qte * pu, lang),
      motif: l.motif || l.reason || texte('remboursement', lang),
    };
  });
  const prenom = prenomDe(avoir?.client_name, lang);
  const numero = avoir?.order_number || '';
  return {
    lang,
    sujet: await sujetDe('email-avoir-remboursement', SUJETS.avoir(avoir?.number || '', lang), lang),
    html: await renderEmail('email-avoir-remboursement', {
      prenom,
      client: avoir?.client_name || '',
      numero,
      numero_avoir: avoir?.number || '',
      numero_facture: factureNumero || '',
      lignes,
      total: formatEuro(Math.abs(Number(avoir?.total_ttc) || 0), lang),
      /* Le gabarit portait « Bonjour Julie … commande n° 2412 » en dur :
         tous les avoirs partaient avec ce prénom et ce numéro. */
      accroche: accrocheAvoir(prenom, numero, lang),
      motif: avoir?.motif || avoir?.reason || texte('remboursement', lang),
      moyen_paiement: texte('carteBancaire', lang),
    }, lang),
  };
}

/**
 * Rupture de stock avec choix de remplacement.
 * Chaque lien porte le même jeton signé, seul `choix` change : le
 * serveur retrouve la demande par le jeton, jamais par l'URL.
 */
export async function ruptureEmail(
  order: any,
  o: { choice: any; token: string; titre: string; corps: string; baseUrl: string; lang?: LangueClient },
) {
  const lang = o.lang || langueDeCommande(order);
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
      prix: formatEuro(opt.prix, lang),
      // Un écart nul ne s'affiche pas : « − 0,00 € » ne veut rien dire.
      ecart: ecart > 0 ? `− ${formatEuro(ecart, lang)}`
        : ecart < 0 ? texte('memePrix', lang) : '',
      lien: `${jeton}&choix=${encodeURIComponent(opt.product_id)}`,
    };
  });

  return {
    lang,
    sujet: `${o.titre} — ${order?.order_number || ''}`.trim(),
    html: await renderEmail('email-message-libre', {
      prenom: prenomDe(order?.customer_name, lang),
      numero: order?.order_number || '',
      surtitre: `${texte('commandeNo', lang)} ${order?.order_number || ''} · ${texte('votreAvis', lang)}`,
      titre: o.titre,
      corps: o.corps || corpsRupture(esc(o.choice.line_name), lang),
      article: o.choice.line_name,
      article_ref: o.choice.line_ref || '—',
      article_qte: String(qte),
      article_pu: formatEuro(pu, lang),
      article_montant: formatEuro(qte * pu, lang),
      options,
      base_lien: base,
      lien_rembourser: `${jeton}&choix=rembourser`,
      lien_attendre: `${jeton}&choix=attendre`,
      /* Panacher n'a de sens qu'a partir de deux unites : sur une seule,
         le lien ouvrirait une page qui ne propose rien de plus. */
      panachable: qte > 1,
      lien_composer: `${jeton}&choix=composer`,
      titre_panache: titrePanache(qte, lang),
      note_ecart: texte('ecartPourNous', lang),
    }, lang),
  };
}

/**
 * Expédition — déclenché quand la commande passe à « expédiée ».
 * Le suivi peut venir de trois transporteurs selon le mode choisi.
 */
export async function expeditionEmail(order: any, o: OptEmail = {}) {
  const lang = langueDe(order, o);
  const suivi = order?.tracking_number || order?.mondial_relay_tracking
    || order?.logspher_tracking || '';

  /* Un colis partiel ne contient pas la commande entiere : l'email doit
     lister ce qui est DANS LE CARTON, et dire ce qui suivra. Annoncer les
     articles manquants comme expedies serait le pire des messages. */
  const colis: Record<string, number> | null = order?.last_shipment || null;
  const cumul: Record<string, number> | null = order?.shipped_qty || colis;

  const toutes = lignesDe(order, lang, o.produits);
  const brutes = parseLines(order?.lines).filter(l => !isShipping(l));

  const lignes = colis
    ? toutes.map((l, i) => ({ ...l, qte: String(colis[brutes[i]?.product_id] ?? 0) }))
            .filter(l => Number(l.qte) > 0)
    : toutes;

  const reste = cumul
    ? toutes.map((l, i) => {
        const commande = Number(brutes[i]?.qty) || 0;
        const parti = Number(cumul[brutes[i]?.product_id]) || 0;
        return { nom: l.nom, qte: String(Math.max(0, commande - parti)) };
      }).filter(l => Number(l.qte) > 0)
    : [];

  const nbArticles = lignes.reduce((s, l) => s + (Number(l.qte) || 0), 0);

  return {
    lang,
    sujet: await sujetDe('email-expedition', SUJETS.expedition(order?.order_number || '', lang), lang),
    html: await renderEmail('email-expedition', {
      prenom: prenomDe(order?.customer_name, lang),
      numero: order?.order_number || '',
      suivi: suivi || '—',
      point_relais: order?.relay_point_name || texte('livraisonDomicile', lang),
      adresse_html: adresseHtml(order || {}),
      /* Le suivi était entièrement inventé dans le gabarit : trois dates
         d'août 2026 et quatre produits fixes, envoyés à tout le monde. */
      lignes,
      titre_contenu: titreContenu(nbArticles, lang),
      colis_info: colisInfo(Number(order?.weight_g) || null, lang),
      date_confirmee: formatDateHeure(order?.created_at, lang),
      date_preparee: formatDateHeure(order?.picked_at || order?.created_at, lang),
      date_remise: formatDateHeure(order?.shipped_at || new Date().toISOString(), lang),
      attente_retrait: texte('attenteRetrait', lang),
      /* Le bloc « ce qui suivra » ne s'affiche que s'il reste quelque
         chose : sur un envoi complet il n'aurait rien a dire. */
      a_reliquat: reste.length > 0,
      reste,
      titre_reliquat: titreReliquat(lang),
      note_reliquat: noteReliquat(lang),
      etape_remise: texte('etapeRemise', lang),
      etape_remise_note: texte('etapeRemiseNote', lang),
    }, lang),
  };
}

/**
 * Colis disponible en point relais.
 *
 * Pour une commande en relais, « livrée » côté back-office veut dire
 * arrivée au relais — le client doit encore venir la chercher. C'est
 * donc ce message-là qu'il attend, pas un « merci, c'est livré ».
 */
export async function colisDisponibleEmail(order: any, o: OptEmail = {}) {
  const lang = langueDe(order, o);
  return {
    lang,
    sujet: await sujetDe('email-colis-disponible',
      SUJETS.colisDisponible(order?.order_number || '', lang), lang),
    html: await renderEmail('email-colis-disponible', {
      prenom: prenomDe(order?.customer_name, lang),
      numero: order?.order_number || '',
      suivi: order?.mondial_relay_tracking || order?.tracking_number || order?.logspher_tracking || '—',
      point_relais: order?.relay_point_name || texte('votrePointRelais', lang),
      adresse_html: adresseHtml(order || {}),
    }, lang),
  };
}

/** Message libre — envoi manuel depuis la fiche commande. */
export async function messageLibre(
  order: any, opts: { surtitre?: string; titre: string; corps: string; lang?: LangueClient },
) {
  const lang = opts.lang || langueDeCommande(order);
  return {
    lang,
    sujet: opts.titre,
    html: await renderEmail('email-message-libre', {
      prenom: prenomDe(order?.customer_name, lang),
      numero: order?.order_number || '',
      surtitre: (opts.surtitre
        || `${texte('commandeNo', lang)} ${order?.order_number || ''}`).toUpperCase(),
      titre: opts.titre,
      corps: opts.corps,
    }, lang),
  };
}
