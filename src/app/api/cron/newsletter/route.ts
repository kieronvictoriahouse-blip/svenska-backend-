import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import {
  newsletterActive, semaineCourante, lireSemaine, envoyerApercu, envoyerLettre,
} from '@/lib/newsletter-hebdo';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/* ═══════════════════════════════════════════════════════════════
   NEWSLETTER HEBDOMADAIRE — passage quotidien (vercel.json : 9 h UTC,
   10 h l'hiver et 11 h l'été à Paris ; un cron par jour au plus sur
   l'offre Vercel actuelle)

   · mercredi : la lettre est composée, l'aperçu part à la boutique ;
   · jeudi    : elle part aux inscrits (sauf annulée) ;
   · les autres jours : un envoi resté en cours reprend.
   Réglage Marketing → Newsletter (company_settings.newsletter_auto).
   ═══════════════════════════════════════════════════════════════ */
export async function GET(req: NextRequest) {
  // Vercel : « Bearer CRON_SECRET » ; ou un admin connecté (lancement à la main).
  const secret = (process.env.CRON_SECRET || '').trim();
  const parCron = !!secret && req.headers.get('authorization') === `Bearer ${secret}`;
  if (!parCron && !(await requireAuth(req))) {
    if (!secret) console.error('[cron/newsletter] CRON_SECRET absent de l’environnement : passage refusé');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!(await newsletterActive())) {
    return NextResponse.json({ ok: true, journal: ['newsletter automatique désactivée'] });
  }

  const jour = new Date().toLocaleDateString('en-US', { timeZone: 'Europe/Paris', weekday: 'short' });
  const semaine = semaineCourante();
  const journal: string[] = [`${jour} · semaine du ${semaine}`];
  try {
    if (jour === 'Wed') {
      journal.push(await envoyerApercu(semaine));
    } else {
      const ligne = await lireSemaine(semaine);
      if (jour === 'Thu' || ligne?.statut === 'en_cours') {
        const r = await envoyerLettre(semaine);
        journal.push(`envoi : ${r.etat}, ${r.envoyes} envoyés, ${r.echecs} échecs, ${r.restants} restants`);
      }
    }
  } catch (e: any) {
    journal.push(`erreur : ${e?.message || e}`);
    console.error('[cron/newsletter]', journal);
    return NextResponse.json({ ok: false, journal }, { status: 500 });
  }
  console.log('[cron/newsletter]', journal);
  return NextResponse.json({ ok: true, journal });
}
