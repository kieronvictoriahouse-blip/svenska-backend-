import { NextRequest, NextResponse } from 'next/server';
import { rechercherPointsMondialRelay, langueRelais, MESSAGES_RELAIS } from '@/lib/points-relais';

export const dynamic = 'force-dynamic';

/* Points Mondial Relay en direct, au code postal. La recherche vit dans
   @/lib/points-relais, partagée avec /api/logspher/relay-points qui s'en
   sert pour la France. Échec amont (délai de 6 s, clé absente, refus de
   Mondial Relay) : 200 avec une liste vide et un message court dans la
   langue demandée (`lang` = fr | en | sv) — le détail reste dans les logs. */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const cp = searchParams.get('cp') || '';
  const pays = searchParams.get('pays') || 'FR';
  const ville = searchParams.get('ville') || '';
  const lang = langueRelais(searchParams.get('lang'));

  if (!cp && !ville) {
    return NextResponse.json({ error: 'cp ou ville requis', points: [], erreur: MESSAGES_RELAIS.requis[lang] }, { status: 400 });
  }

  const r = await rechercherPointsMondialRelay({ cp, pays, ville });
  if (!r.ok) {
    console.warn('[mondial-relay/points]', r.panne, r.detail);
    return NextResponse.json({
      points: [],
      erreur: r.panne === 'adresse' ? MESSAGES_RELAIS.aucunPoint[lang] : MESSAGES_RELAIS.indisponible[lang],
    });
  }
  return NextResponse.json({
    points: r.points,
    ...(r.points.length ? {} : { erreur: MESSAGES_RELAIS.aucunPoint[lang] }),
  });
}
