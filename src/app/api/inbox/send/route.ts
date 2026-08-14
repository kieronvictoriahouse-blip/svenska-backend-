import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';
import { envoyer } from '@/lib/mail-send';
import { resolveFolders, syncFolder } from '@/lib/imap';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/* Envoi immediat depuis la redaction. La composition, la signature et
   la copie dans les Envoyes vivent dans lib/mail-send, partage avec les
   envois programmes : les deux doivent produire le meme message. */
export async function POST(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorise' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  try {
    /* La redaction envoie le corps sous `corps`, l'expediteur le lit sous
       `html` : sans cette correspondance, seuls le sujet et la signature
       partaient — le message arrivait vide. */
    const r = await envoyer({ ...body, html: body.html ?? body.corps ?? '' });
    if (body.inReplyTo) {
      await supabaseAdmin.from('inbox_messages')
        .update({ answered: true }).eq('message_id', body.inReplyTo);
    }
    // Le brouillon d'origine n'a plus lieu d'etre une fois le message parti.
    if (body.draftId) await supabaseAdmin.from('email_drafts').delete().eq('id', body.draftId);
    /* On rapatrie tout de suite le dossier Envoyes : sans ca le message
       n'apparait qu'a la relève suivante, et on croit qu'il s'est perdu. */
    try {
      const roles = await resolveFolders();
      await syncFolder(roles.sent, 30);
    } catch (e) { console.error('[inbox/send] rafraichissement des Envoyés', e); }

    return NextResponse.json({ ok: true, avertissement: r.avertissement });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Envoi impossible' }, { status: 500 });
  }
}
