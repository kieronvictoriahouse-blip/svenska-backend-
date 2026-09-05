// Sentry — capture des erreurs côté serveur (routes API, RSC, crons).
//
// SaaS : ce fichier est le même pour TOUTES les instances. Chaque instance
// s'identifie par son env `SHOPFLOW_INSTANCE`, posée au provisionnement, qui
// devient un tag sur chaque erreur → un seul projet Sentry, filtrable par
// client. Sans `SENTRY_DSN`, tout est un no-op silencieux : une instance qui
// n'a pas branché Sentry tourne exactement pareil.
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: !!dsn,
  // Nom de l'instance cliente (ex. « boulangerie-nord »). Permet de savoir
  // CHEZ QUI le bug est arrivé sans se connecter à 40 projets.
  initialScope: {
    tags: { instance: process.env.SHOPFLOW_INSTANCE || 'dev' },
  },
  environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
  release: process.env.VERCEL_GIT_COMMIT_SHA, // relie l'erreur au commit déployé
  // Traces de performance : 100 % en dev pour tout voir, 10 % en prod pour le volume.
  // Les erreurs, elles, remontent toujours à 100 %.
  tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.1,
  // NB : `includeLocalVariables` (variables locales dans les stack traces) est
  // volontairement ABSENT — il attache l'inspecteur Node à l'init, ce qui fait
  // déborder le timeout « Collecting page data » du build sur les routes IMAP
  // lourdes (/api/cron/inbox…). Le confort ne vaut pas un build cassé.
});
