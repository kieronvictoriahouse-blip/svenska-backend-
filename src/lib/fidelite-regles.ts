/* ═══════════════════════════════════════════════════════════════
   FIDÉLITÉ & PARRAINAGE — LES RÈGLES

   Pur calcul, sans base ni import : c'est ce fichier qu'on relit pour
   savoir ce que le programme promet. @/lib/fidelite l'applique aux
   données ; le back-office l'importe aussi pour afficher les taux.

   · Code ami (« parrainage ») : donné dès la 1re commande payée. Un
     nouveau client qui l'utilise a −5 % sur sa 1re commande.
   · Code fidélité : donné à la 3e commande payée, utilisable seulement
     avec l'email de son propriétaire. −5 % sur chaque commande, −10 %
     pendant 12 mois après chaque parrainage validé.
   · Les deux remises ne portent pas sur les articles déjà en promotion
     (remise produit ou catégorie). Les box en profitent.
   ═══════════════════════════════════════════════════════════════ */

export const FIDELITE = {
  /** Commandes payées pour recevoir le code fidélité. */
  seuilCommandes: 3,
  tauxFidele: 5,
  tauxAmbassadeur: 10,
  /** Remise du nouveau client qui arrive avec un code ami. */
  tauxFilleul: 5,
  /** Durée du −10 % après un parrainage validé. */
  dureeBonusMois: 12,
  /** Un parrainage n'est validé qu'après ce délai, si la commande de
   *  l'ami n'a été ni annulée ni remboursée entre-temps. */
  delaiValidationJours: 14,
} as const;

/** Statuts d'une commande réellement payée — ceux du tableau de bord,
 *  plus « partial » (expédiée en partie) et « preparing » (en cours de
 *  préparation). Sans « preparing », une commande d'ami encore en
 *  préparation au 14e jour faisait ANNULER le parrainage (« commande
 *  annulée ») et ne comptait pas pour le code fidélité. */
export const STATUTS_PAYES = ['paid', 'confirmed', 'preparing', 'shipped', 'delivered', 'partial'];

export type SorteCode = 'fidelite' | 'parrainage';

export const normEmail = (e: unknown) => String(e ?? '').trim().toLowerCase();

/** Motif `ilike` qui ne vaut QUE cet email : « _ » et « % » y sont des
 *  jokers, et « _ » est courant dans une adresse. */
export const motifEmail = (e: unknown) => normEmail(e).replace(/[\\%_]/g, c => '\\' + c);

export function ajouterMois(d: Date, mois: number): Date {
  const r = new Date(d.getTime());
  r.setUTCMonth(r.getUTCMonth() + mois);
  return r;
}

/**
 * Fin du −10 %. Douze mois après le dernier parrainage validé — mais
 * comptés au plus tôt depuis l'entrée chez les fidèles : un parrainage
 * fait avant la 3e commande est gardé en réserve et ne commence à
 * courir qu'à ce moment-là.
 */
export function finDuBonus(
  dernierParrainage: Date | string | null | undefined,
  fideleDepuis: Date | string,
): Date | null {
  if (!dernierParrainage) return null;
  const debut = Math.max(new Date(dernierParrainage).getTime(), new Date(fideleDepuis).getTime());
  if (Number.isNaN(debut)) return null;
  return ajouterMois(new Date(debut), FIDELITE.dureeBonusMois);
}

export function tauxFidelite(finBonus: Date | null, maintenant: Date = new Date()): number {
  return finBonus && finBonus > maintenant ? FIDELITE.tauxAmbassadeur : FIDELITE.tauxFidele;
}

/** Sans 0/O ni 1/I/L : un code doit pouvoir se dicter au téléphone. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** « Åsa Lindqvist » → « ASA ». Le code ami porte le prénom : l'ami
 *  sait de qui il vient. */
export function racinePrenom(nom: string | null | undefined): string {
  const prenom = String(nom ?? '').trim().split(/\s+/)[0] || '';
  const ascii = prenom.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z]/g, '');
  return ascii.slice(0, 10) || 'AMI';
}

/** `alea(n)` rend un entier dans [0, n[ — crypto.randomInt côté serveur. */
export function nouveauCode(
  sorte: SorteCode, nom: string | null | undefined, alea: (n: number) => number,
): string {
  const tirage = (n: number) => Array.from({ length: n }, () => ALPHABET[alea(ALPHABET.length)]).join('');
  /* Le code fidélité ne porte pas de prénom : il n'est pas fait pour
     circuler, et un tirage de 6 caractères ne se devine pas. */
  return sorte === 'parrainage' ? `${racinePrenom(nom)}-${tirage(4)}` : `FID-${tirage(6)}`;
}

/** 9 derniers chiffres : « +33 6 12… » et « 06 12… » sont le même numéro. */
export const normTelephone = (t: unknown) => String(t ?? '').replace(/\D/g, '').slice(-9);

export const normNom = (n: unknown) => String(n ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z]+/g, ' ').trim();

/**
 * Le filleul est-il le parrain sous une autre adresse ? Même téléphone,
 * ou même nom complet. Un prénom seul ne suffit pas : deux Anna ne sont
 * pas la même personne. L'adresse n'est pas comparée — des amis
 * choisissent souvent le même point relais.
 */
export function memePersonne(
  a: { nom?: string | null; telephone?: string | null },
  b: { nom?: string | null; telephone?: string | null },
): boolean {
  const ta = normTelephone(a.telephone);
  if (ta.length === 9 && ta === normTelephone(b.telephone)) return true;
  const na = normNom(a.nom);
  return na.includes(' ') && na === normNom(b.nom);
}
