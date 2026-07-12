import { NextResponse } from 'next/server';

// Espace client retiré (checkout invité). Endpoint désactivé.
const gone = () => NextResponse.json({ error: 'Fonctionnalité désactivée' }, { status: 410 });

export const POST = gone;
