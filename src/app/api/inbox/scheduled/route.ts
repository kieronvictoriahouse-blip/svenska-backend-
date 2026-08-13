import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';
import { decoderPJ, PJ_MAX } from '@/lib/mail-send';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const { data, error } = await supabaseAdmin
    .from('scheduled_emails').select('*').order('send_at').limit(100);
  // Tant que la migration 035 n'est pas passee, la table n'existe pas :
  // on renvoie une liste vide plutot qu'une erreur qui casserait l'ecran.
  if (error) return NextResponse.json({ programmes: [] });
  return NextResponse.json({ programmes: data || [] });
}

/** Programme un envoi. Le message n'est composé qu'au moment de partir. */
export async function POST(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const b = await req.json().catch(() => ({}));

  if (!String(b.to || '').trim()) return NextResponse.json({ error: 'Destinataire manquant' }, { status: 400 });
  if (!String(b.subject || '').trim()) return NextResponse.json({ error: 'Objet manquant' }, { status: 400 });

  const quand = new Date(b.sendAt || '');
  if (Number.isNaN(+quand)) return NextResponse.json({ error: 'Date d’envoi invalide' }, { status: 400 });

  /* Une minute de marge : programmer dans le passé partirait au prochain
     passage du cron, ce qui ne correspond pas à ce qui a été demandé. */
  if (+quand < Date.now() + 60_000) {
    return NextResponse.json({ error: 'Choisis une date au moins une minute dans le futur' }, { status: 400 });
  }

  const { poids } = decoderPJ(b.attachments);
  if (poids > PJ_MAX) {
    return NextResponse.json({ error: 'Pièces jointes trop lourdes — 8 Mo maximum' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.from('scheduled_emails').insert({
    to_emails: b.to, cc_emails: b.cc || null, subject: b.subject,
    body: b.corps || '', attachments: b.attachments || [],
    in_reply_to: b.inReplyTo || null, send_at: quand.toISOString(),
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (b.draftId) await supabaseAdmin.from('email_drafts').delete().eq('id', b.draftId);
  return NextResponse.json({ ok: true, programme: data });
}

/** Annule un envoi encore en attente. */
export async function DELETE(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const id = new URL(req.url).searchParams.get('id') || '';

  /* La condition sur `pending` fait tout le travail : si le cron a déjà
     pris la ligne, la mise à jour ne touche rien et on le dit. */
  const { data, error } = await supabaseAdmin.from('scheduled_emails')
    .update({ status: 'cancelled' }).eq('id', id).eq('status', 'pending').select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) {
    return NextResponse.json({ error: 'Trop tard : cet envoi est déjà parti ou en cours' }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
