import crypto from 'crypto';

/* ═══════════════════════════════════════════════════════════════
   SECRETS DE REPLI

   Le dépôt est PUBLIC : une valeur de repli écrite en dur
   (« process.env.X || 'svenska-internal-2024' ») est connue de tout le
   monde dès que la variable manque sur Vercel. On ne coupe pas pour
   autant la fonction qui en dépend (l'envoi automatique des factures,
   par exemple) : à défaut de la variable, le secret est DÉRIVÉ de la clé
   de service Supabase, toujours présente côté serveur et jamais publiée.
   Appelant et appelé tournent dans le même déploiement : ils obtiennent
   la même valeur.
   ═══════════════════════════════════════════════════════════════ */
export function secretServeur(variable: string, usage: string): string {
  const v = process.env[variable];
  if (v) return v;
  const base = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!base) throw new Error(`${variable} absent et clé de service introuvable`);
  return crypto.createHmac('sha256', base).update(`swedish-cravings:${usage}`).digest('base64url');
}
