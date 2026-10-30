import { supabaseAdmin } from '@/lib/supabase';

/* ═══════════════════════════════════════════════════════════════
   BOUTIQUES — plusieurs vitrines, une seule entreprise (migration 066)

   Swedish Cravings (« sc ») et, à venir, une épicerie française pour
   la Suède partagent CETTE base : une numérotation de factures, un
   chiffre d'affaires URSSAF, un suivi du seuil européen.

   Une vitrine se signale par `?boutique=<code>` (ou l'en-tête
   `x-boutique`). Sans rien, c'est Swedish Cravings : le site actuel
   continue de fonctionner sans changer une ligne.

   Règle pour tout nouveau code : une lecture publique (catalogue,
   carrousel, offres, contenus) FILTRE par boutique ; une écriture
   laisse la base poser le défaut 'sc' tant qu'elle ne vient pas d'une
   autre vitrine.
   ═══════════════════════════════════════════════════════════════ */

export const BOUTIQUE_DEFAUT = 'sc';

const CODE_VALIDE = /^[a-z]{2,8}$/;

/** Code de boutique sûr : un code mal formé retombe sur Swedish Cravings. */
export function codeBoutique(brut: unknown): string {
  const c = String(brut ?? '').trim().toLowerCase();
  return CODE_VALIDE.test(c) ? c : BOUTIQUE_DEFAUT;
}

/** Boutique d'une requête : `?boutique=` puis l'en-tête `x-boutique`. */
export function boutiqueDeRequete(req: Request | { url: string; headers: Headers }): string {
  try {
    const q = new URL(req.url).searchParams.get('boutique');
    if (q) return codeBoutique(q);
  } catch { /* URL relative : on passe à l'en-tête */ }
  return codeBoutique(req.headers.get('x-boutique'));
}

/* Colonne absente = migration 066 pas encore passée. On retombe alors
   sur l'ancienne lecture (une seule ligne) au lieu de casser le site. */
const colonneAbsente = (e: any) =>
  !!e && (e.code === '42703' || /column .*boutique_code.* does not exist/i.test(String(e.message || '')));

/**
 * Configuration de marque d'une boutique (ligne de `white_label_config`).
 * Remplace les lectures `.limit(1)` : avec deux lignes, elles auraient
 * pris une marque au hasard. `champs` limite les colonnes lues.
 */
export async function configBoutique(code: string = BOUTIQUE_DEFAUT, champs = '*'): Promise<Record<string, any> | null> {
  const b = codeBoutique(code);
  const { data, error } = await supabaseAdmin
    .from('white_label_config').select(champs).eq('boutique_code', b).maybeSingle();
  if (!error) return (data as Record<string, any>) || null;
  if (colonneAbsente(error)) {
    const r = await supabaseAdmin.from('white_label_config').select(champs).limit(1).maybeSingle();
    // Une erreur de lecture doit rester une erreur : les factures s'appuient
    // dessus pour refuser de sceller un vendeur vide.
    if (r.error) throw r.error;
    return (r.data as Record<string, any>) || null;
  }
  throw error;
}

export type Boutique = {
  code: string;
  nom: string;
  devise: string;
  langue: string;
  front_url: string | null;
  prefixe_commande: string | null;
  retrait_sur_place: boolean;
  actif: boolean;
};

const SC: Boutique = {
  code: 'sc', nom: 'Swedish Cravings', devise: 'EUR', langue: 'fr',
  front_url: null, prefixe_commande: null, retrait_sur_place: true, actif: true,
};

let cache: { at: number; liste: Boutique[] } | null = null;

/** Fiche d'une boutique (table `boutiques`), mise en cache une minute. */
export async function boutique(code: string = BOUTIQUE_DEFAUT): Promise<Boutique> {
  const b = codeBoutique(code);
  if (!cache || Date.now() - cache.at > 60_000) {
    const { data, error } = await supabaseAdmin.from('boutiques').select('*');
    cache = { at: Date.now(), liste: error ? [SC] : ((data as Boutique[]) || [SC]) };
  }
  return cache.liste.find(x => x.code === b) || (b === BOUTIQUE_DEFAUT ? SC : { ...SC, code: b, nom: b });
}
