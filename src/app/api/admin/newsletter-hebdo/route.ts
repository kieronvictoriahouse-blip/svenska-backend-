import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import {
  abonnes, choisirContenu, envoyerApercu, envoyerLettre, jeudiDe, lireSemaine,
  newsletterActive, preparer, rendreLettre, semaineCourante,
} from '@/lib/newsletter-hebdo';
import type { LangueClient } from '@/lib/langue-client';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/* Marketing → Newsletter : état de la lettre de la semaine, aperçu,
   annulation, réglage on/off, envoi immédiat. */

export async function GET(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const semaine = semaineCourante();
  const url = new URL(req.url);

  // Aperçu HTML (langue au choix) : la lettre telle qu'elle partirait maintenant.
  if (url.searchParams.get('apercu')) {
    const lang = (['fr', 'en', 'sv'].includes(url.searchParams.get('lang') || '') ? url.searchParams.get('lang') : 'fr') as LangueClient;
    const ligne = await lireSemaine(semaine);
    const contenu = ligne && ligne.statut !== 'preparee' ? ligne.contenu : await choisirContenu(semaine);
    const { sujet, html } = await rendreLettre(contenu, semaine, lang, null);
    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Sujet': encodeURIComponent(sujet) },
    });
  }

  const [active, ligne, inscrits, { data: historique }] = await Promise.all([
    newsletterActive(), lireSemaine(semaine), abonnes().catch(() => []),
    supabaseAdmin.from('newsletter_hebdo')
      .select('semaine, statut, sujet, nb_envoyes, nb_echecs, envoi_debut_at, envoi_fin_at')
      .order('semaine', { ascending: false }).limit(10),
  ]);
  const parLangue = inscrits.reduce((m: Record<string, number>, a) => ({ ...m, [a.lang]: (m[a.lang] || 0) + 1 }), {});
  return NextResponse.json({
    active, semaine, jeudi: jeudiDe(semaine), ligne,
    inscrits: inscrits.length, parLangue, historique: historique || [],
  });
}

export async function POST(req: NextRequest) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const { action, valeur } = await req.json().catch(() => ({}));
  const semaine = semaineCourante();
  const ligne = await lireSemaine(semaine);

  switch (action) {
    case 'activer': {
      const { error } = await supabaseAdmin.from('company_settings')
        .upsert({ key: 'newsletter_auto', value: valeur ? '1' : '0' }, { onConflict: 'key' });
      return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true });
    }
    case 'annuler': {
      if (ligne && ['en_cours', 'envoyee'].includes(ligne.statut)) {
        return NextResponse.json({ error: 'Déjà partie : impossible de l’annuler.' }, { status: 409 });
      }
      const { error } = await supabaseAdmin.from('newsletter_hebdo')
        .upsert({ semaine, statut: 'annulee', updated_at: new Date().toISOString() }, { onConflict: 'semaine' });
      return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true });
    }
    case 'reactiver': {
      if (ligne?.statut !== 'annulee') return NextResponse.json({ ok: true });
      await supabaseAdmin.from('newsletter_hebdo').update({ statut: 'preparee', updated_at: new Date().toISOString() }).eq('semaine', semaine);
      await preparer(semaine);
      return NextResponse.json({ ok: true });
    }
    case 'tester': {
      const moi = String((user as any)?.email || '');
      const r = await envoyerApercu(semaine, { a: moi.includes('@') ? [moi] : undefined, force: true });
      return NextResponse.json({ ok: true, message: r });
    }
    case 'envoyer': {
      if (ligne?.statut === 'annulee') return NextResponse.json({ error: 'Annulée cette semaine : réactivez-la d’abord.' }, { status: 409 });
      const r = await envoyerLettre(semaine);
      return NextResponse.json({ ok: true, ...r });
    }
    default:
      return NextResponse.json({ error: 'Action inconnue' }, { status: 400 });
  }
}
