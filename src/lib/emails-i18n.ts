import { LangueClient, LOCALE_CLIENT } from '@/lib/langue-client';

/* ═══════════════════════════════════════════════════════════════
   TEXTES DES EMAILS CLIENTS

   Ce que les gabarits ne peuvent pas porter : ce qui se calcule
   (montants, dates, mentions légales) et qui doit néanmoins être écrit
   dans la langue du destinataire.

   Les gabarits HTML, eux, existent en trois versions — un client anglais
   ne lit pas un email français, même avec les bons chiffres dedans.
   ═══════════════════════════════════════════════════════════════ */

type Texte = Record<LangueClient, string>;

const T = <T extends Record<string, Texte>>(x: T) => x;

export const TE = T({
  offerte: { fr: 'Offerte', en: 'Free', sv: 'Fri' },
  article: { fr: 'Article', en: 'Item', sv: 'Artikel' },
  remboursement: { fr: 'Remboursement', en: 'Refund', sv: 'Återbetalning' },
  carteBancaire: { fr: 'Carte bancaire', en: 'Card payment', sv: 'Kortbetalning' },
  livraisonDomicile: { fr: 'Livraison à domicile', en: 'Home delivery', sv: 'Hemleverans' },
  votrePointRelais: { fr: 'votre point relais', en: 'your pickup point', sv: 'ditt ombud' },
  attenteRetrait: { fr: 'vous serez prévenu(e)', en: 'you will be notified', sv: 'du får ett meddelande' },
  etapeRemise: { fr: 'Remis au transporteur', en: 'Handed to the carrier', sv: 'Överlämnat till transportören' },
  etapeRemiseNote: {
    fr: 'En cours d’acheminement vers votre point relais',
    en: 'On its way to your pickup point',
    sv: 'På väg till ditt ombud',
  },
  ecartPourNous: {
    fr: 'L’écart de prix est pour nous — c’est nous qui sommes en rupture, pas vous.',
    en: 'The price difference is on us — we are the ones out of stock, not you.',
    sv: 'Prisskillnaden står vi för — det är vi som är slutsålda, inte du.',
  },
  memePrix: { fr: 'Même prix pour vous', en: 'Same price for you', sv: 'Samma pris för dig' },
  votreAvis: { fr: 'VOTRE AVIS', en: 'YOUR CHOICE', sv: 'DITT VAL' },
  commandeNo: { fr: 'COMMANDE N°', en: 'ORDER No.', sv: 'ORDER NR' },
});

/** « à vous » quand on n'a pas de prénom : « Bonjour » tout court sonne
 *  brusque, et un prénom inventé serait pire. */
export const SANS_PRENOM: Texte = { fr: 'à vous', en: 'there', sv: 'där' };

export const texte = (cle: keyof typeof TE, lang: LangueClient) => TE[cle][lang];

/* ── Objets des emails ──────────────────────────────────────── */
export const SUJETS = {
  confirmation: (numero: string, lang: LangueClient) =>
    lang === 'sv' ? `Order ${numero} bekräftad — tack!`
    : lang === 'en' ? `Order ${numero} confirmed — thank you!`
    : `Commande ${numero} confirmée — merci !`,

  facture: (numero: string, lang: LangueClient) =>
    lang === 'sv' ? `Din faktura ${numero}`.trim()
    : lang === 'en' ? `Your invoice ${numero}`.trim()
    : `Votre facture ${numero}`.trim(),

  avoir: (numero: string, lang: LangueClient) =>
    lang === 'sv' ? `Din återbetalning ${numero}`.trim()
    : lang === 'en' ? `Your refund ${numero}`.trim()
    : `Votre remboursement ${numero}`.trim(),

  expedition: (numero: string, lang: LangueClient) =>
    lang === 'sv' ? `Din order ${numero} är på väg`
    : lang === 'en' ? `Your order ${numero} is on its way`
    : `Votre commande ${numero} est en route`,

  colisDisponible: (numero: string, lang: LangueClient) =>
    lang === 'sv' ? `Ditt paket ${numero} väntar hos ombudet`.trim()
    : lang === 'en' ? `Your parcel ${numero} is waiting at the pickup point`.trim()
    : `Votre colis ${numero} vous attend en point relais`.trim(),
};

/* ── Fragments calculés ─────────────────────────────────────── */

/** Mention de paiement du bas de la confirmation. La date était figée au
 *  12 août 2026 dans le gabarit : toutes les confirmations portaient
 *  cette date, quelle que soit la commande. */
export function mentionPaiement(date: any, lang: LangueClient, mentionTva: string): string {
  const d = formatDate(date, lang);
  const paye = lang === 'sv' ? `Betalt med kort den ${d}`
    : lang === 'en' ? `Paid by card on ${d}`
    : `Réglé par carte bancaire le ${d}`;
  return `${paye} · ${mentionTva}`;
}

/** « Livraison · Mondial Relay » ou « Livraison à domicile ». */
export function libelleLivraison(order: any, lang: LangueClient): string {
  const mot = lang === 'sv' ? 'Frakt' : lang === 'en' ? 'Shipping' : 'Livraison';
  const via = order?.relay_point_name ? 'Mondial Relay'
    : texte('livraisonDomicile', lang);
  return `${mot} · ${via}`;
}

/** Titre du bloc « contenu du colis », avec le vrai nombre d'articles. */
export function titreContenu(nb: number, lang: LangueClient): string {
  return lang === 'sv' ? `PAKETETS INNEHÅLL · ${nb} ARTIKLAR`
    : lang === 'en' ? `PARCEL CONTENTS · ${nb} ITEMS`
    : `CONTENU DU COLIS · ${nb} ARTICLE${nb > 1 ? 'S' : ''}`;
}

/** Ligne « 1 colis · 1,84 kg ». Le poids n'est pas toujours connu : on
 *  l'omet plutôt que d'annoncer un chiffre faux. */
export function colisInfo(poidsG: number | null, lang: LangueClient): string {
  const colis = lang === 'sv' ? '1 paket' : lang === 'en' ? '1 parcel' : '1 colis';
  if (!poidsG || poidsG <= 0) return colis;
  const kg = (poidsG / 1000).toLocaleString(LOCALE_CLIENT[lang], {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
  return `${colis} · ${kg} kg`;
}

/** Accroche de l'avoir. Le gabarit contenait « Bonjour Julie … commande
 *  n° 2412 » en dur : tous les avoirs partaient avec ce prénom et ce
 *  numéro. */
export function accrocheAvoir(prenom: string, numero: string, lang: LangueClient): string {
  return lang === 'sv'
    ? `Hej ${prenom}, tack för att du hörde av dig. Vi har utfärdat en kreditnota för din order nr ${numero} och begärt återbetalning till ditt ursprungliga betalsätt.`
    : lang === 'en'
    ? `Hello ${prenom}, thank you for letting us know. We have issued a credit note for your order no. ${numero} and requested a refund to your original payment method.`
    : `Bonjour ${prenom}, merci de nous avoir signalé le souci. Nous avons établi un avoir sur votre commande n° ${numero} et le remboursement a été demandé sur votre moyen de paiement d’origine.`;
}

/** Texte par défaut du message de rupture. */
export function corpsRupture(article: string, lang: LangueClient): string {
  const gras = `<strong style="color:#1F231C;">${article}</strong>`;
  return lang === 'sv'
    ? `När jag packade ditt paket upptäckte jag att ${gras} var slut. Jag ville inte försena din order utan att fråga dig först — här är vad jag kan erbjuda i stället.`
    : lang === 'en'
    ? `While packing your parcel I noticed that ${gras} was out of stock. I did not want to delay your order without asking you first, so here is what I can offer instead.`
    : `En préparant votre colis, je me suis aperçue que le ${gras} était épuisé. Je ne voulais pas retarder votre commande sans vous demander votre avis, alors voici ce que je peux vous proposer à la place.`;
}

/* ── Formats ────────────────────────────────────────────────── */

export const formatEuro = (n: unknown, lang: LangueClient) =>
  (Number(n) || 0).toLocaleString(LOCALE_CLIENT[lang], {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }) + ' €';

export function formatDate(d: any, lang: LangueClient): string {
  if (!d) return '';
  const x = new Date(String(d).length <= 10 ? `${d}T12:00:00` : d);
  if (Number.isNaN(+x)) return '';
  return x.toLocaleDateString(LOCALE_CLIENT[lang], { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Date courte du suivi : « 12 août · 18:04 ». */
export function formatDateHeure(d: any, lang: LangueClient): string {
  if (!d) return '—';
  const x = new Date(d);
  if (Number.isNaN(+x)) return '—';
  const jour = x.toLocaleDateString(LOCALE_CLIENT[lang], { day: 'numeric', month: 'long' });
  const heure = x.toLocaleTimeString(LOCALE_CLIENT[lang], { hour: '2-digit', minute: '2-digit' });
  return `${jour} · ${heure}`;
}
