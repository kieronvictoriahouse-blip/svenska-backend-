import { NextResponse } from 'next/server';

// Espace client retiré (checkout invité). Endpoint désactivé : il exposait un
// profil client à partir d'un jeton auto-émis sur n'importe quel email.
const gone = () => NextResponse.json({ error: 'Fonctionnalité désactivée' }, { status: 410 });

export const GET = gone;
export const PUT = gone;
export const POST = gone;
