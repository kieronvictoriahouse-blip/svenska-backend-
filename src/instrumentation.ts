// Point d'entrée d'instrumentation de Next.js. Chargé une fois au démarrage
// du serveur, il branche la config Sentry correspondant au runtime.
//
// `onRequestError` fait le gros du travail « la moindre erreur » côté serveur :
// toute exception non rattrapée dans une route API, un Server Component ou un
// cron remonte automatiquement à Sentry — sans toucher aux 118 routes une par une.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config');
  }
}

export { captureRequestError as onRequestError } from '@sentry/nextjs';
