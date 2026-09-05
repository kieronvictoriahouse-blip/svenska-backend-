/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    /* Active src/instrumentation.ts (stable seulement en Next 15). Sans lui,
       Sentry ne capture rien côté serveur. */
    instrumentationHook: true,
    serverComponentsExternalPackages: ['pdfkit', 'sharp', 'imapflow', 'mailparser'],
    /* Les polices et le monogramme sont lus depuis le disque au moment de
       générer un PDF. Le traceur de Next ne les voit pas (aucun import ne
       les référence), il faut donc les inclure explicitement dans le
       bundle serverless — sans quoi la facture sort en Helvetica. */
    outputFileTracingIncludes: {
      '/api/invoices/**': ['./src/assets/fonts/**', './public/documents/**'],
      '/api/send-invoice-email/**': ['./src/assets/fonts/**', './public/documents/**'],
      '/api/purchase-orders/**': ['./src/assets/fonts/**', './public/documents/**'],
      /* Même raison pour les gabarits d'email, lus sur le disque à l'envoi :
         sans cette ligne, toute route qui envoie un mail planterait en
         production alors que tout marche en local. Volontairement large —
         plusieurs routes envoient des emails (webhook, crons, factures). */
      '/api/**': ['./src/emails/templates/**'],
    },
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },
  // Cors pour les appels depuis le front HTML Netlify
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin',  value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PUT,DELETE,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type,Authorization' },
        ],
      },
    ];
  },
};

// ─── Sentry ───────────────────────────────────────────────────────────────
// `withSentryConfig` téléverse les source maps au build (pour dénoifier les
// stack traces minifiées) UNIQUEMENT si SENTRY_AUTH_TOKEN + org + project sont
// posés. Sans eux — une instance sans Sentry — le build passe pareil, sans
// upload. Rien à conditionner côté code.
const { withSentryConfig } = require('@sentry/nextjs');

module.exports = withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,          // logs d'upload seulement en CI
  widenClientFileUpload: true,       // source maps plus complètes
  // Route-proxy sur le domaine de l'instance : les erreurs navigateur passent
  // par /monitoring au lieu d'appeler *.sentry.io directement, ce que les
  // bloqueurs de pub coupent. `middleware.ts` ne matche que /admin et /api,
  // donc /monitoring n'est pas intercepté — rien à exclure.
  tunnelRoute: '/monitoring',
  disableLogger: true,               // retire le logger Sentry du bundle client
  // Ne pas téléverser de source maps si aucune config Sentry n'est présente
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
});

