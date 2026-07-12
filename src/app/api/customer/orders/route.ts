import { NextResponse } from 'next/server';

// Espace client retiré (checkout invité). Endpoint désactivé : il renvoyait les
// commandes d'un client sur simple saisie d'email, sans vérification → fuite de
// données personnelles (RGPD). Le suivi passe désormais par l'email de confirmation.
const gone = () => NextResponse.json({ error: 'Fonctionnalité désactivée' }, { status: 410 });

export const GET = gone;
export const POST = gone;
