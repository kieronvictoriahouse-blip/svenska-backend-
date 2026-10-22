import { LangueClient, LOCALE_CLIENT } from '@/lib/langue-client';
import { FIDELITE } from '@/lib/fidelite-regles';

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

/* ── Reliquat ───────────────────────────────────────────────── */

export const titreReliquat = (lang: LangueClient) =>
  lang === 'sv' ? 'SKICKAS SENARE'
  : lang === 'en' ? 'TO FOLLOW'
  : 'CE QUI SUIVRA';

/** Le client a payé la commande entière : il faut le rassurer sur les
 *  deux points qui inquiètent — le prix et la démarche à faire. */
export const noteReliquat = (lang: LangueClient) =>
  lang === 'sv'
    ? 'Dessa artiklar var slut när vi packade. Vi skickar dem så snart de är i lager igen, utan extra fraktkostnad och utan att du behöver göra något.'
  : lang === 'en'
    ? 'These items were out of stock when we packed your parcel. We will send them as soon as they are back in stock, at no extra delivery cost and with nothing for you to do.'
    : 'Ces articles étaient épuisés au moment de préparer votre colis. Nous vous les expédions dès leur retour en stock, sans frais de port supplémentaires et sans démarche de votre part.';

/** Invitation a panacher, quand plusieurs unites sont concernees. */
export const titrePanache = (qte: number, lang: LangueClient) =>
  lang === 'sv' ? `Eller blanda dina ${qte} enheter som du vill`
  : lang === 'en' ? `Or mix your ${qte} units as you like`
  : `Ou répartissez vos ${qte} unités comme vous voulez`;

/* ── Fidélité & parrainage ──────────────────────────────────── */

const F = FIDELITE;

const nbCommandes = (n: number, lang: LangueClient) =>
  lang === 'sv' ? `${n} beställning${n > 1 ? 'ar' : ''}`
  : lang === 'en' ? `${n} order${n > 1 ? 's' : ''}`
  : `${n} commande${n > 1 ? 's' : ''}`;

export const TF = T({
  fideliteLabel: { fr: 'VOTRE CODE FIDÉLITÉ', en: 'YOUR LOYALTY CODE', sv: 'DIN STAMKUNDSKOD' },
  fideliteNote: {
    fr: 'Il ne fonctionne qu’avec cette adresse email.',
    en: 'It only works with this email address.',
    sv: 'Koden fungerar bara med den här e-postadressen.',
  },
  amiLabel: { fr: 'PARRAINAGE', en: 'REFER A FRIEND', sv: 'TIPSA EN VÄN' },
  amiTitre: {
    fr: 'Faites découvrir la Suède à un ami',
    en: 'Share a taste of Sweden',
    sv: 'Ge en vän smak av Sverige',
  },
  amiLien: { fr: 'Ou envoyez-lui ce lien :', en: 'Or send them this link:', sv: 'Eller skicka den här länken:' },
  parrainageTitre: { fr: 'Votre ami a commandé', en: 'Your friend placed an order', sv: 'Din vän har beställt' },
  parrainageSujet: {
    fr: 'Votre ami a commandé — merci !',
    en: 'Your friend placed an order — thank you!',
    sv: 'Din vän har beställt — tack!',
  },
  faireCourses: { fr: 'FAIRE MES COURSES', en: 'SHOP NOW', sv: 'TILL BUTIKEN' },
});

export type BlocsFidelite = {
  commandes: number; codeAmi: string | null; codeFidelite: string | null;
  taux: number; finBonus: Date | null; nouveauFidele: boolean;
};

/**
 * Blocs « code fidélité » et « code ami » de la confirmation de commande.
 * Une variable vide masque son bloc : `code_fidelite` absent tant que le
 * client n'a pas ses trois commandes.
 */
export function blocsFidelite(b: BlocsFidelite, lang: LangueClient): Record<string, string> {
  const vars: Record<string, string> = {};

  if (b.codeFidelite) {
    const bonus = b.taux === F.tauxAmbassadeur && b.finBonus ? formatDate(b.finBonus, lang) : '';
    vars.code_fidelite = b.codeFidelite;
    vars.fidelite_label = TF.fideliteLabel[lang];
    vars.fidelite_note = TF.fideliteNote[lang];
    vars.fidelite_titre = b.nouveauFidele
      ? (lang === 'sv' ? 'Välkommen bland våra stamkunder!' : lang === 'en' ? 'Welcome to our regulars!' : 'Bienvenue parmi nos fidèles !')
      : (lang === 'sv' ? `−${b.taux} % på dina beställningar` : lang === 'en' ? `−${b.taux}% on your orders` : `−${b.taux} % sur vos commandes`);
    vars.fidelite_texte = lang === 'sv'
      ? (b.nouveauFidele ? `Tack för dina ${nbCommandes(b.commandes, lang)}! ` : '')
        + `Din personliga kod ger dig −${b.taux} % på varje beställning, utom varor som redan är rabatterade.`
        + (bonus ? ` Till och med ${bonus} tack vare ditt tips, därefter −${F.tauxFidele} %.`
          : ` Tipsa en vän så höjs din kod till −${F.tauxAmbassadeur} % i ${F.dureeBonusMois} månader.`)
      : lang === 'en'
      ? (b.nouveauFidele ? `Thank you for your ${nbCommandes(b.commandes, lang)}! ` : '')
        + `Your personal code gives you −${b.taux}% on every order, excluding items already on sale.`
        + (bonus ? ` Until ${bonus}, thanks to your referral; then −${F.tauxFidele}%.`
          : ` Refer a friend and your code goes up to −${F.tauxAmbassadeur}% for ${F.dureeBonusMois} months.`)
      : (b.nouveauFidele ? `Merci pour vos ${nbCommandes(b.commandes, lang)} ! ` : '')
        + `Votre code personnel vous donne −${b.taux} % sur chaque commande, hors articles déjà en promotion.`
        + (bonus ? ` Jusqu’au ${bonus}, grâce à votre parrainage ; ensuite −${F.tauxFidele} %.`
          : ` Parrainez un ami et votre code passe à −${F.tauxAmbassadeur} % pendant ${F.dureeBonusMois} mois.`);
  }

  if (b.codeAmi) {
    const restantes = Math.max(0, F.seuilCommandes - b.commandes);
    vars.code_ami = b.codeAmi;
    vars.ami_label = TF.amiLabel[lang];
    vars.ami_titre = TF.amiTitre[lang];
    vars.ami_lien = TF.amiLien[lang];
    vars.ami_texte = lang === 'sv'
      ? `Med den här koden får din vän −${F.tauxFilleul} % på sin första beställning.`
        + (b.codeFidelite
          ? ` När vännen har beställt höjs din stamkundskod till −${F.tauxAmbassadeur} % i ${F.dureeBonusMois} månader.`
          : ` Och du har ${nbCommandes(restantes, lang)} kvar till din stamkundskod: −${F.tauxFidele} % på dina beställningar, och −${F.tauxAmbassadeur} % i ${F.dureeBonusMois} månader när en vän har beställt.`)
      : lang === 'en'
      ? `With this code, your friend gets −${F.tauxFilleul}% off their first order.`
        + (b.codeFidelite
          ? ` As soon as they order, your loyalty code goes up to −${F.tauxAmbassadeur}% for ${F.dureeBonusMois} months.`
          : ` And you are ${nbCommandes(restantes, lang)} away from your loyalty code: −${F.tauxFidele}% on your orders, and −${F.tauxAmbassadeur}% for ${F.dureeBonusMois} months once a friend has ordered.`)
      : `Avec ce code, votre ami a −${F.tauxFilleul} % sur sa 1re commande.`
        + (b.codeFidelite
          ? ` Dès qu’il a commandé, votre code fidélité passe à −${F.tauxAmbassadeur} % pendant ${F.dureeBonusMois} mois.`
          : ` Et vous, plus que ${nbCommandes(restantes, lang)} avant votre code fidélité : −${F.tauxFidele} % sur vos commandes, et −${F.tauxAmbassadeur} % pendant ${F.dureeBonusMois} mois dès qu’un ami a commandé.`);
  }

  return vars;
}

/** Corps de l'email « votre ami a commandé ». */
export function corpsParrainage(
  p: { boutique: string; finBonus: Date | null; restantes: number },
  lang: LangueClient,
): string {
  const merci = lang === 'sv' ? `Tack vare dig har en ny kund upptäckt ${p.boutique}.`
    : lang === 'en' ? `Thanks to you, a new customer has discovered ${p.boutique}.`
    : `Grâce à vous, un nouveau client a découvert ${p.boutique}.`;
  if (p.finBonus) {
    const d = formatDate(p.finBonus, lang);
    return merci + (lang === 'sv'
      ? ` Din stamkundskod ger nu −${F.tauxAmbassadeur} % på varje beställning till och med ${d} (utom varor som redan är rabatterade).`
      : lang === 'en'
      ? ` Your loyalty code is now worth −${F.tauxAmbassadeur}% on every order until ${d} (excluding items already on sale).`
      : ` Votre code fidélité vaut désormais −${F.tauxAmbassadeur} % sur chaque commande, jusqu’au ${d} (hors articles déjà en promotion).`);
  }
  return merci + (lang === 'sv'
    ? ` Dina −${F.tauxAmbassadeur} % sparas: de börjar gälla med din stamkundskod när du har gjort ${F.seuilCommandes} beställningar (${p.restantes} kvar) och varar i ${F.dureeBonusMois} månader.`
    : lang === 'en'
    ? ` Your −${F.tauxAmbassadeur}% is set aside: it will start with your loyalty code once you have placed ${F.seuilCommandes} orders (${p.restantes} to go), and last ${F.dureeBonusMois} months.`
    : ` Votre −${F.tauxAmbassadeur} % est gardé de côté : il démarrera avec votre code fidélité, dès que vous aurez passé ${F.seuilCommandes} commandes (plus que ${p.restantes}), et durera ${F.dureeBonusMois} mois.`);
}

/** Rappel du code ami au bas de l'email de parrainage. */
export const encorePlus = (code: string, lang: LangueClient) =>
  lang === 'sv' ? `Vill du tipsa fler? Din vänkod ${code} gäller för alla dina vänner.`
  : lang === 'en' ? `Want to do it again? Your friend code ${code} works for all your friends.`
  : `Envie de recommencer ? Votre code ami ${code} reste valable pour tous vos amis.`;
