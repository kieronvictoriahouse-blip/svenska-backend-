/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['pdfkit', 'sharp'],
    /* Les polices et le monogramme sont lus depuis le disque au moment de
       générer un PDF. Le traceur de Next ne les voit pas (aucun import ne
       les référence), il faut donc les inclure explicitement dans le
       bundle serverless — sans quoi la facture sort en Helvetica. */
    outputFileTracingIncludes: {
      '/api/invoices/**': ['./src/assets/fonts/**', './public/documents/**'],
      '/api/send-invoice-email/**': ['./src/assets/fonts/**', './public/documents/**'],
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

module.exports = nextConfig;
