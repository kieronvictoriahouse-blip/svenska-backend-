/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Le robot lit le schéma et les migrations DU DÉPÔT (dossier
    // parent) : sans cette inclusion, le traceur de Vercel ne les
    // embarquerait pas dans les fonctions serverless.
    outputFileTracingIncludes: {
      '/api/tick': ['../install/**', '../supabase/migrations/**'],
    },
  },
};
export default nextConfig;
