import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';
import { setFlag, moveMessage, resolveFolders } from '@/lib/imap';

export const dynamic = 'force-dynamic';

/** Liste des messages d'un dossier, plus les compteurs de la colonne de gauche. */
export async function GET(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const p = new URL(req.url).searchParams;
  const vue = p.get('vue') || 'INBOX';       // INBOX | unread | starred | <dossier>
  const filtre = p.get('filtre') || 'tous';  // tous | non-lus | pieces-jointes
  const q = (p.get('q') || '').trim();

  let req_ = supabaseAdmin.from('inbox_messages')
    .select('id, folder, uid, from_name, from_email, subject, preview, seen, flagged, label, attachments, sent_at, contact_id')
    .order('sent_at', { ascending: false }).limit(300);

  if (vue === 'unread') req_ = req_.eq('seen', false);
  else if (vue === 'starred') req_ = req_.eq('flagged', true);
  else req_ = req_.eq('folder', vue);

  if (filtre === 'non-lus') req_ = req_.eq('seen', false);
  if (q) req_ = req_.or(`subject.ilike.%${q}%,from_email.ilike.%${q}%,preview.ilike.%${q}%`);

  const { data, error } = await req_;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let messages = data || [];
  // Le filtre « avec pièce jointe » se fait ici : jsonb_array_length ne
  // s'exprime pas simplement via PostgREST.
  if (filtre === 'pieces-jointes') {
    messages = messages.filter(m => Array.isArray(m.attachments) && m.attachments.length > 0);
  }

  const [{ count: nonLus }, { count: suivis }, { data: etat }] = await Promise.all([
    supabaseAdmin.from('inbox_messages').select('id', { count: 'exact', head: true }).eq('folder', 'INBOX').eq('seen', false),
    supabaseAdmin.from('inbox_messages').select('id', { count: 'exact', head: true }).eq('flagged', true),
    supabaseAdmin.from('inbox_sync_state').select('*'),
  ]);

  return NextResponse.json({ messages, compteurs: { nonLus: nonLus || 0, suivis: suivis || 0 }, etat: etat || [] });
}

/** Corps complet d'un message — chargé seulement à l'ouverture. */
export async function POST(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const { id } = await req.json().catch(() => ({}));
  const { data } = await supabaseAdmin.from('inbox_messages').select('*').eq('id', id).maybeSingle();
  if (!data) return NextResponse.json({ error: 'Message introuvable' }, { status: 404 });

  /* Ouvrir un message le marque lu, et le changement part vers IONOS :
     lu ici doit vouloir dire lu dans le webmail. */
  if (!data.seen) {
    await supabaseAdmin.from('inbox_messages').update({ seen: true }).eq('id', id);
    try { await setFlag(data.folder, data.uid, '\\Seen', true); }
    catch (e) { console.error('[inbox] flag Seen non reporte', e); }
  }
  return NextResponse.json({ message: { ...data, seen: true } });
}

/** Étoile, lu/non lu, corbeille. */
export async function PUT(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const { ids, action } = await req.json().catch(() => ({}));
  const liste: string[] = Array.isArray(ids) ? ids : [ids].filter(Boolean);
  if (!liste.length) return NextResponse.json({ error: 'Aucun message' }, { status: 400 });

  const { data: msgs } = await supabaseAdmin
    .from('inbox_messages').select('id, folder, uid, seen, flagged').in('id', liste);

  const roles = await resolveFolders().catch(() => null);

  for (const m of msgs || []) {
    try {
      if (action === 'lu' || action === 'non-lu') {
        const on = action === 'lu';
        await supabaseAdmin.from('inbox_messages').update({ seen: on }).eq('id', m.id);
        await setFlag(m.folder, m.uid, '\\Seen', on);
      } else if (action === 'etoile') {
        const on = !m.flagged;
        await supabaseAdmin.from('inbox_messages').update({ flagged: on }).eq('id', m.id);
        await setFlag(m.folder, m.uid, '\\Flagged', on);
      } else if (action === 'corbeille' && roles) {
        await moveMessage(m.folder, m.uid, roles.trash);
      }
    } catch (e) {
      // Le cache est deja a jour ; l'ecart sera rattrape a la prochaine releve.
      console.error('[inbox] action non reportee vers IMAP', action, e);
    }
  }
  return NextResponse.json({ ok: true });
}
