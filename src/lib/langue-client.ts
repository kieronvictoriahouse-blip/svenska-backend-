/* ═══════════════════════════════════════════════════════════════
   LANGUE DU CLIENT

   Un client anglais qui reçoit sa facture en français ne la lit pas.
   Le back-office a sa langue (celle de qui l'utilise) ; le client a la
   sienne, et les deux n'ont aucune raison de coïncider.

   Le pays n'était écrit nulle part : il fallait le déduire d'une adresse
   de livraison stockée sous DEUX formes incompatibles — objet JSON pour
   49 commandes, texte libre pour 60. D'où l'extraction ci-dessous, puis
   une colonne explicite pour ne plus jamais recommencer.

   `lang` à NULL veut dire « déduite du pays ». Une valeur veut dire
   « choisie à la main » et ne doit jamais être écrasée par un recalcul :
   sans cette distinction, corriger la langue d'un client servirait une
   seule fois.
   ═══════════════════════════════════════════════════════════════ */

export type LangueClient = 'fr' | 'en' | 'sv';
export const LANGUES_CLIENT: LangueClient[] = ['fr', 'en', 'sv'];

/** Noms de pays écrits en toutes lettres, tels qu'ils apparaissent dans
 *  les adresses saisies à la main. */
const NOMS_PAYS: Record<string, string> = {
  france: 'FR', frankrike: 'FR', francia: 'FR',
  sverige: 'SE', suede: 'SE', 'suède': 'SE', sweden: 'SE', schweden: 'SE',
  belgique: 'BE', belgium: 'BE', belgien: 'BE',
  suisse: 'CH', switzerland: 'CH', schweiz: 'CH',
  allemagne: 'DE', germany: 'DE', deutschland: 'DE',
  espagne: 'ES', spain: 'ES', espana: 'ES', 'españa': 'ES',
  italie: 'IT', italy: 'IT', italia: 'IT',
  'royaume-uni': 'GB', 'united kingdom': 'GB', angleterre: 'GB', england: 'GB',
  luxembourg: 'LU', 'pays-bas': 'NL', netherlands: 'NL', nederland: 'NL',
  irlande: 'IE', ireland: 'IE',
  danemark: 'DK', denmark: 'DK', danmark: 'DK',
  'norvège': 'NO', norvege: 'NO', norway: 'NO', norge: 'NO',
  finlande: 'FI', finland: 'FI', suomi: 'FI',
  portugal: 'PT', autriche: 'AT', austria: 'AT',
  pologne: 'PL', poland: 'PL', monaco: 'MC',
};

/**
 * Pays de livraison, en ISO deux lettres.
 *
 * L'ordre des tentatives va du plus fiable au plus approximatif : une
 * colonne dédiée, puis un champ d'objet, puis la dernière ligne d'une
 * adresse libre, et enfin le code postal. Renvoie `null` plutôt qu'un
 * pays inventé — mieux vaut une langue par défaut assumée qu'une
 * déduction fausse.
 */
export function paysDeLivraison(order: any): string | null {
  if (!order) return null;

  /* Seule la colonne dédiée fait foi d'emblée : elle n'existe que parce
     qu'on l'a calculée. */
  if (order.shipping_country) {
    return String(order.shipping_country).trim().toUpperCase().slice(0, 2);
  }

  let a = order.shipping_address ?? order.billing_address;
  if (typeof a === 'string' && a.trim().startsWith('{')) {
    try { a = JSON.parse(a); } catch { /* on retombe sur le texte */ }
  }

  if (a && typeof a === 'object') {
    const c = a.country || a.pays || a.country_code;
    if (c) {
      const brut = String(c).trim();
      const parNom = NOMS_PAYS[brut.toLowerCase()];
      return parNom || brut.toUpperCase().slice(0, 2);
    }
  }

  const texte = typeof a === 'string' ? a : '';
  if (texte) {
    const bouts = texte.split(',').map(s => s.trim()).filter(Boolean);
    const dernier = (bouts[bouts.length - 1] || '').toLowerCase();
    if (/^[a-z]{2}$/.test(dernier)) return dernier.toUpperCase();
    if (NOMS_PAYS[dernier]) return NOMS_PAYS[dernier];

    /* Repli sur le code postal : cinq chiffres isolés, c'est la France.
       On exclut les formats britanniques (« LS16 9AG »), qui mêlent
       lettres et chiffres et déclencheraient un faux positif. */
    if (/\b\d{5}\b/.test(texte) && !/\b[A-Z]{1,2}\d/i.test(texte)) return 'FR';
  }

  /* `relay_point_pays` en tout dernier recours, et seulement si un point
     relais est réellement nommé. Mesuré : il vaut « FR » sur 108
     commandes sur 109, y compris deux livraisons à Leeds et Altrincham.
     Le lire avant l'adresse rendait ces clients britanniques français. */
  if (order.relay_point_pays && order.relay_point_name) {
    return String(order.relay_point_pays).trim().toUpperCase().slice(0, 2);
  }

  return null;
}

/* Le français couvre les pays francophones voisins : la boutique est
   française, ses clients belges et suisses écrivent en français. La
   Suisse alémanique et la Flandre existent — d'où la correction à la
   main, qui prime toujours. */
const PAYS_FR = new Set(['FR', 'BE', 'CH', 'LU', 'MC', 'GP', 'MQ', 'RE', 'YT', 'GF', 'NC', 'PF']);
const PAYS_SV = new Set(['SE']);

/** Langue attendue pour un pays. L'anglais est le repli : c'est la
 *  langue qu'un Néerlandais ou un Polonais lira, pas le français. */
export function langueDePays(pays: string | null | undefined): LangueClient {
  if (!pays) return 'fr';
  const p = String(pays).trim().toUpperCase().slice(0, 2);
  if (PAYS_FR.has(p)) return 'fr';
  if (PAYS_SV.has(p)) return 'sv';
  return 'en';
}

/**
 * Pays déclaré par un profil client — **seulement s'il est crédible**.
 *
 * `customer_profiles.country` porte `DEFAULT 'FR'` : un profil créé sans
 * adresse affiche « FR » sans que le client l'ait jamais dit. Sur les 19
 * profils existants, 12 sont dans ce cas. On n'accepte donc ce pays que
 * lorsqu'une adresse l'accompagne — sinon on lit une valeur par défaut
 * en croyant lire une donnée.
 */
export function paysDeProfil(profil: any): string | null {
  if (!profil?.country) return null;
  const aUneAdresse = !!(profil.address1 || profil.city || profil.postal_code);
  if (!aUneAdresse) return null;
  return String(profil.country).trim().toUpperCase().slice(0, 2);
}

/** Sources de langue, du plus explicite au plus déduit. */
export type SourcesLangue = {
  /** Profil boutique, indexé par email — survit d'une commande à l'autre. */
  profil?: any;
  /** Fiche du carnet d'adresses, quand le client y figure. */
  contact?: any;
};

/**
 * Langue à utiliser pour une commande.
 *
 * Ordre : le choix porté par la commande, puis celui du profil client,
 * puis celui du contact, puis la déduction depuis le pays. Un choix
 * explicite gagne toujours — c'est ce qui permet de corriger un cas
 * particulier sans se battre contre l'automatisme.
 *
 * Le pays de livraison prime sur celui du profil : un client peut se
 * faire livrer ailleurs que chez lui, et le colis part avec le document.
 */
export function langueDeCommande(order: any, s: SourcesLangue | any = {}): LangueClient {
  // Tolère l'ancien appel `langueDeCommande(order, contact)`.
  const src: SourcesLangue = s && (s.profil || s.contact) ? s : { contact: s };

  for (const choix of [order?.lang, src.profil?.lang, src.contact?.lang]) {
    if (choix && LANGUES_CLIENT.includes(choix)) return choix as LangueClient;
  }
  const pays = paysDeLivraison(order)
    || paysDeProfil(src.profil)
    || (src.contact?.country ? String(src.contact.country).trim().toUpperCase().slice(0, 2) : null);
  return langueDePays(pays);
}

/** Vrai quand la langue vient d'un choix, pas d'une déduction — l'écran
 *  doit pouvoir dire laquelle des deux il affiche. */
export function langueChoisie(order: any, s: SourcesLangue | any = {}): boolean {
  const src: SourcesLangue = s && (s.profil || s.contact) ? s : { contact: s };
  return [order?.lang, src.profil?.lang, src.contact?.lang]
    .some(c => c && LANGUES_CLIENT.includes(c));
}

export const NOM_LANGUE: Record<LangueClient, string> = {
  fr: 'Français', en: 'English', sv: 'Svenska',
};

/** Locale de formatage des montants et des dates du client. */
export const LOCALE_CLIENT: Record<LangueClient, string> = {
  fr: 'fr-FR', en: 'en-GB', sv: 'sv-SE',
};
