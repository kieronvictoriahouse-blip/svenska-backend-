import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';
import { syncFolder, resolveFolders } from '@/lib/imap';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/* Synchronisation à la demande — le bouton « Envoyer / recevoir ».
   Le plan Vercel n'autorise qu'un cron par jour : la relève manuelle
   est donc le mode normal, pas un secours. */
export async function POST(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  // Le nom du dossier « Envoyes » vient du serveur, il n'est pas devinable.
  const roles = await resolveFolders();
  const resultats = [];
  for (const dossier of ['INBOX', roles.sent]) {
    resultats.push(await syncFolder(dossier));
  }
  const erreurs = resultats.filter(r => r.erreur);
  return NextResponse.json({ ok: !erreurs.length, resultats });
}

/** État de la dernière relève, pour le libellé « il y a 3 min ». */
export async function GET(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const { data } = await supabaseAdmin.from('inbox_sync_state').select('*');
  return NextResponse.json({ etat: data || [] });
}
