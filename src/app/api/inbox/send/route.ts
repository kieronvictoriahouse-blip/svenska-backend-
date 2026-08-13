import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';
import { envoyer } from '@/lib/mail-send';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/* Envoi immediat depuis la redaction. La composition, la signature et
   la copie dans les Envoyes vivent dans lib/mail-send, partage avec les
   envois programmes : les deux doivent produire le meme message. */
export async function POST(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorise' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  try {
    await envoyer(body);
    if (body.inReplyTo) {
      await supabaseAdmin.from('inbox_messages')
        .update({ answered: true }).eq('message_id', body.inReplyTo);
    }
    // Le brouillon d'origine n'a plus lieu d'etre une fois le message parti.
    if (body.draftId) await supabaseAdmin.from('email_drafts').delete().eq('id', body.draftId);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Envoi impossible' }, { status: 500 });
  }
}
