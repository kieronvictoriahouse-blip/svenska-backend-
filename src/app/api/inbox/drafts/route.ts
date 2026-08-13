import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';
import { deposerBrouillon } from '@/lib/mail-send';
import { deleteMessage } from '@/lib/imap';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const { data, error } = await supabaseAdmin
    .from('email_drafts').select('*').order('updated_at', { ascending: false }).limit(100);
  // Tant que la migration 035 n'est pas passee, la table n'existe pas :
  // on renvoie une liste vide plutot qu'une erreur qui casserait l'ecran.
  if (error) return NextResponse.json({ brouillons: [] });
  return NextResponse.json({ brouillons: data || [] });
}

/**
 * Enregistre un brouillon.
 *
 * Il vit en base pour être repris ici, et une copie est déposée dans le
 * dossier Drafts du serveur pour être visible depuis le webmail. La
 * copie précédente est supprimée avant : sans ça, chaque sauvegarde
 * laisserait un doublon de plus du même message en cours d'écriture.
 */
export async function POST(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const b = await req.json().catch(() => ({}));

  const ligne = {
    to_emails: b.to || '', cc_emails: b.cc || '', subject: b.subject || '',
    body: b.corps || '', attachments: b.attachments || [],
    in_reply_to: b.inReplyTo || null, updated_at: new Date().toISOString(),
  };

  let ancien: any = null;
  if (b.id) {
    const { data } = await supabaseAdmin.from('email_drafts').select('*').eq('id', b.id).maybeSingle();
    ancien = data;
  }

  const { data: draft, error } = ancien
    ? await supabaseAdmin.from('email_drafts').update(ligne).eq('id', b.id).select().single()
    : await supabaseAdmin.from('email_drafts').insert(ligne).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  /* Dépôt serveur — non bloquant : le brouillon est déjà sauvé en base,
     un serveur indisponible ne doit pas faire perdre le texte écrit. */
  let uid: number | null = null;
  let folder: string | null = null;
  try {
    if (ancien?.imap_uid && ancien?.imap_folder) {
      await deleteMessage(ancien.imap_folder, ancien.imap_uid).catch(() => {});
    }
    const dep = await deposerBrouillon({
      to: ligne.to_emails, cc: ligne.cc_emails, subject: ligne.subject || '(brouillon)',
      html: ligne.body, inReplyTo: ligne.in_reply_to || undefined,
      attachments: ligne.attachments,
    });
    uid = dep.uid; folder = dep.folder;
    await supabaseAdmin.from('email_drafts')
      .update({ imap_uid: uid, imap_folder: folder }).eq('id', draft.id);
  } catch (e) {
    console.error('[drafts] dépôt IMAP impossible', e);
  }

  return NextResponse.json({ ok: true, brouillon: { ...draft, imap_uid: uid, imap_folder: folder } });
}

export async function DELETE(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const id = new URL(req.url).searchParams.get('id') || '';
  const { data } = await supabaseAdmin.from('email_drafts').select('*').eq('id', id).maybeSingle();
  if (data?.imap_uid && data?.imap_folder) {
    await deleteMessage(data.imap_folder, data.imap_uid).catch(() => {});
  }
  await supabaseAdmin.from('email_drafts').delete().eq('id', id);
  return NextResponse.json({ ok: true });
}
