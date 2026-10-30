import { NextRequest, NextResponse } from 'next/server';
import { BOUTIQUE_DEFAUT, boutique, boutiqueDeRequete } from '@/lib/boutique';

// Returns only PUBLIC keys — safe to expose to the frontend.
// The Supabase anon key is designed to be embedded in client code.
export async function GET(req: NextRequest) {
  const suspendu = process.env.SHOPFLOW_SUSPENDED === '1';
  /* Autre vitrine (migration 066) : elle reçoit en plus sa fiche publique
     (nom, devise, langue…). Swedish Cravings garde la réponse d'avant,
     au champ près. */
  const b = boutiqueDeRequete(req);
  let fiche: Record<string, any> = {};
  if (b !== BOUTIQUE_DEFAUT) {
    const f = await boutique(b);
    fiche = {
      boutique: {
        code: f.code, nom: f.nom, devise: f.devise, langue: f.langue,
        front_url: f.front_url, retrait_sur_place: f.retrait_sur_place, actif: f.actif,
      },
    };
  }
  return NextResponse.json(
    {
      supabaseUrl:     process.env.NEXT_PUBLIC_SUPABASE_URL     || null,
      supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || null,
      suspendu,
      ...fiche,
    },
    {
      headers: {
        /* Suspendu : pas de cache — la vitrine doit voir le drapeau
           tout de suite, et sa disparition tout aussi vite. */
        'Cache-Control':                suspendu ? 'no-store' : 'public, s-maxage=3600',
        'Access-Control-Allow-Origin':  '*',
        /* La boutique peut venir de l'en-tête : le cache partagé ne doit
           pas servir la réponse d'une vitrine à une autre. */
        ...(req.headers.has('x-boutique') ? { 'Vary': 'x-boutique' } : {}),
      },
    }
  );
}
