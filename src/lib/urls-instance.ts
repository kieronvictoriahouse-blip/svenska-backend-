import { supabaseAdmin } from '@/lib/supabase';

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

let cacheFront: string | null = null;
let cacheAt = 0;

/** URL publique de la vitrine — env normalisée, sinon config, sinon erreur claire. */
export async function urlVitrine(): Promise<string> {
  const env = normaliser(process.env.NEXT_PUBLIC_FRONT_URL);
  if (env) return env;

  if (cacheFront && Date.now() - cacheAt < 60_000) return cacheFront;
  const { data } = await supabaseAdmin
    .from('white_label_config').select('front_url').limit(1).maybeSingle();
  const cfg = normaliser((data as any)?.front_url);
  if (cfg) { cacheFront = cfg; cacheAt = Date.now(); return cfg; }

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
