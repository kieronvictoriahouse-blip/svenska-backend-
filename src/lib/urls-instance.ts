import { BOUTIQUE_DEFAUT, codeBoutique, configBoutique, boutique } from '@/lib/boutique';

/* ═══════════════════════════════════════════════════════════════
   URLS DE L'INSTANCE — vitrine et admin, blindées

   Le 28/08/2026, un client n'a pas pu payer : Stripe refusait la
   success_url. La variable NEXT_PUBLIC_FRONT_URL existait mais sa
   valeur était malformée — et pendant des mois, une URL codée en dur
   dans le checkout masquait le problème. Le débranding a retiré le
   masque, Stripe a dit non, et la vente est partie.

   Règle désormais : une URL d'instance se NORMALISE (schéma https
   ajouté si absent), se VALIDE (new URL), et retombe sur la
   configuration de l'instance (white_label_config.front_url) avant
   d'échouer. Et quand tout manque, on échoue en FRANÇAIS et en disant
   quoi faire — pas en laissant Stripe répondre « Not a valid URL » à
   un client qui tient sa carte bleue.
   ═══════════════════════════════════════════════════════════════ */

function normaliser(brut: string | undefined | null): string | null {
  let u = String(brut || '').trim().replace(/\/+$/, '');
  if (!u) return null;
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  try { new URL(u); return u; } catch { return null; }
}

/* Une entrée par boutique : deux vitrines n'ont jamais la même URL. */
const cacheFront = new Map<string, { url: string; at: number }>();

/**
 * URL publique de la vitrine — env normalisée, sinon config, sinon erreur claire.
 * Sans code, Swedish Cravings : la variable d'environnement reste la sienne.
 * Une autre boutique a sa propre URL (table `boutiques`, puis sa config).
 */
export async function urlVitrine(code: string = BOUTIQUE_DEFAUT): Promise<string> {
  const b = codeBoutique(code);
  if (b === BOUTIQUE_DEFAUT) {
    const env = normaliser(process.env.NEXT_PUBLIC_FRONT_URL);
    if (env) return env;
  }

  const hit = cacheFront.get(b);
  if (hit && Date.now() - hit.at < 60_000) return hit.url;

  /* Autre vitrine : la fiche boutique prime sur sa config de marque. */
  const fiche = b === BOUTIQUE_DEFAUT ? null : normaliser((await boutique(b)).front_url);
  /* Lecture ratée = config vide : on garde l'erreur claire ci-dessous. */
  const data = fiche ? null : await configBoutique(b, 'front_url').catch(() => null);
  const cfg = fiche || normaliser((data as any)?.front_url);
  if (cfg) { cacheFront.set(b, { url: cfg, at: Date.now() }); return cfg; }

  if (b !== BOUTIQUE_DEFAUT) {
    throw new Error(
      `URL de la vitrine « ${b} » introuvable : renseigner front_url dans la table boutiques ` +
      'ou le champ « URL de la boutique » dans les Réglages de cette boutique.');
  }
  throw new Error(
    'URL de la vitrine introuvable : renseigner NEXT_PUBLIC_FRONT_URL (Vercel) ' +
    'ou le champ « URL de la boutique » dans Réglages.');
}

/** URL publique de l'admin (liens de remplacement, webhooks internes). */
export function urlAdmin(): string {
  const env = normaliser(process.env.NEXT_PUBLIC_BACKEND_URL);
  if (env) return env;
  throw new Error('URL de l’admin introuvable : renseigner NEXT_PUBLIC_BACKEND_URL (Vercel).');
}
