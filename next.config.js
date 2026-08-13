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
