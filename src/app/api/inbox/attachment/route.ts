import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';
import { fetchAttachment } from '@/lib/imap';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/* Télécharge une pièce jointe reçue. Le fichier est ramené d'IMAP à la
   demande : le cache ne garde que son nom et sa taille. */
export async function GET(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const p = new URL(req.url).searchParams;
  const id = p.get('id') || '';
  const index = Number(p.get('i') || 0);

  const { data: m } = await supabaseAdmin
    .from('inbox_messages').select('folder, uid').eq('id', id).maybeSingle();
  if (!m) return NextResponse.json({ error: 'Message introuvable' }, { status: 404 });

  try {
    const a = await fetchAttachment(m.folder, m.uid, index);
    if (!a) return NextResponse.json({ error: 'Pièce jointe introuvable' }, { status: 404 });

    return new NextResponse(new Uint8Array(a.content), {
      headers: {
        'Content-Type': a.type,
        // Le nom est encodé : un accent ou un espace casserait l'en-tête.
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(a.filename)}`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Téléchargement impossible' }, { status: 500 });
  }
}
