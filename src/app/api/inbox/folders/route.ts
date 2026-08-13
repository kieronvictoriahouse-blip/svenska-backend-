import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';
import { listFolders, resolveFolders, syncFolder } from '@/lib/imap';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** Dossiers réels du serveur, avec leur rôle et ce qu'on en a en cache. */
export async function GET(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  try {
    const [boites, roles] = await Promise.all([listFolders(), resolveFolders()]);
    const { data: caches } = await supabaseAdmin.from('inbox_messages').select('folder');
    const parDossier: Record<string, number> = {};
    for (const m of caches || []) parDossier[m.folder] = (parDossier[m.folder] || 0) + 1;

    const role = (p: string) =>
      p === 'INBOX' ? 'inbox'
      : p === roles.sent ? 'sent' : p === roles.drafts ? 'drafts'
      : p === roles.trash ? 'trash' : p === roles.junk ? 'junk'
      : p === roles.archive ? 'archive' : 'user';

    return NextResponse.json({
      dossiers: boites
        // Les conteneurs sans messages (\Noselect) n'ont rien à faire dans la liste.
        .filter(b => b.path && b.path !== '[Gmail]')
        .map(b => ({ path: b.path, nom: b.name, role: role(b.path), enCache: parDossier[b.path] || 0 })),
      roles,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'IMAP injoignable' }, { status: 500 });
  }
}

/** Relève un dossier précis — ouvrir un dossier jamais synchronisé doit le remplir. */
export async function POST(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const { folder } = await req.json().catch(() => ({}));
  if (!folder) return NextResponse.json({ error: 'Dossier manquant' }, { status: 400 });
  return NextResponse.json({ resultat: await syncFolder(folder) });
}
