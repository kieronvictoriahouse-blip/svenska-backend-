// Sentry — capture des erreurs côté navigateur (React, admin, front).
// C'est cette couche qui attrape « la moindre erreur » vécue par le client :
// écran blanc, bouton qui plante, exception non prévue. No-op sans DSN.
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: !!dsn,
  initialScope: {
    tags: { instance: process.env.NEXT_PUBLIC_SHOPFLOW_INSTANCE || 'dev' },
  },
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV || 'development',
  release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
  tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.1,
  // Rejoue la session juste avant un crash (utile pour reproduire un bug
  // client). 0 % des sessions normales, 100 % de celles avec une erreur.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,
  integrations: [
    Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
  ],
});
