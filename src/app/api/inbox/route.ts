import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';
import { setFlag, moveMessage, resolveFolders } from '@/lib/imap';

export const dynamic = 'force-dynamic';

/** Liste des messages d'un dossier, plus les compteurs de la colonne de gauche. */
/** Compte tolerant : une table absente vaut zero, pas une page en erreur. */
async function compte(table: string, filtre: (q: any) => any): Promise<number> {
  try {
    const { count, error } = await filtre(
      supabaseAdmin.from(table).select('id', { count: 'exact', head: true }));
    return error ? 0 : (count || 0);
  } catch { return 0; }
}

export async function GET(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorise' }, { status: 401 });

  const p = new URL(req.url).searchParams;
  const vue = p.get('vue') || 'INBOX';       // INBOX | unread | starred | <dossier>
  const filtre = p.get('filtre') || 'tous';  // tous | non-lus | pieces-jointes
  const q = (p.get('q') || '').trim();
  const etiq = p.get('etiquette') || '';
  const page = Math.max(0, Number(p.get('page') || 0));
  const taille = Math.min(100, Math.max(10, Number(p.get('taille') || 50)));

  const COLONNES = 'id, folder, uid, message_id, from_name, from_email, to_emails, subject, preview, seen, flagged, label, attachments, sent_at, contact_id';

  /* La liste est paginee : ramener tout le dossier a chaque changement de
     filtre etait tenable sur 200 messages, pas au-dela. */
  const construire = (avecColonnePJ: boolean) => {
    let r = supabaseAdmin.from('inbox_messages')
      .select(COLONNES, { count: 'exact' })
      .order('sent_at', { ascending: false })
      .range(page * taille, page * taille + taille - 1);

    if (vue === 'unread') r = r.eq('seen', false);
    else if (vue === 'starred') r = r.eq('flagged', true);
    else r = r.eq('folder', vue);

    if (filtre === 'non-lus') r = r.eq('seen', false);
    if (filtre === 'pieces-jointes' && avecColonnePJ) r = r.eq('has_attachment', true);
    if (etiq) r = r.eq('label', etiq);
    if (q) r = r.or(`subject.ilike.%${q}%,from_email.ilike.%${q}%,preview.ilike.%${q}%`);
    return r;
  };

  /* `has_attachment` vient de la migration 035. Tant qu'elle n'est pas
     passee, on retombe sur un filtrage en memoire plutot que de rendre
     la boite inutilisable. */
  let { data, error, count } = await construire(filtre === 'pieces-jointes');
  let filtrerEnMemoire = false;
  if (error && filtre === 'pieces-jointes') {
    ({ data, error, count } = await construire(false));
    filtrerEnMemoire = true;
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let messages: any[] = (data || []).map((m: any) => ({
    ...m, has_attachment: Array.isArray(m.attachments) && m.attachments.length > 0,
  }));
  if (filtrerEnMemoire) messages = messages.filter(m => m.has_attachment);

  const [nonLus, suivis, brouillons, programmes] = await Promise.all([
    compte('inbox_messages', (r: any) => r.eq('folder', 'INBOX').eq('seen', false)),
    compte('inbox_messages', (r: any) => r.eq('flagged', true)),
    compte('email_drafts', (r: any) => r),
    compte('scheduled_emails', (r: any) => r.eq('status', 'pending')),
  ]);
  const { data: etat } = await supabaseAdmin.from('inbox_sync_state').select('*');

  return NextResponse.json({
    messages, total: count || messages.length, page, taille,
    compteurs: { nonLus, suivis, brouillons, programmes },
    etat: etat || [],
    /* Le compte IMAP affiché dans l'en-tête de l'écran — la page ne
       doit pas le connaître en dur. */
    compte: process.env.IMAP_USER || '',
  });
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
  const { ids, action, label } = await req.json().catch(() => ({}));
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
      } else if (action === 'etiquette') {
        /* L'etiquette est un classement local, pas un flag IMAP : IONOS
           n'expose pas de mots-cles utilisateur fiables. Elle ne remonte
           donc pas au serveur, et c'est assume. */
        await supabaseAdmin.from('inbox_messages')
          .update({ label: label || null }).eq('id', m.id);
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
