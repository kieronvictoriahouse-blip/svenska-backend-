import { NextRequest, NextResponse } from 'next/server';
import { syncFolder } from '@/lib/imap';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/* Synchronisation IMAP périodique. Le premier passage borne le volume
   (200 messages par dossier) ; les suivants ne lisent que le nouveau. */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET non configuré' }, { status: 500 });
  }

  const resultats = [];
  for (const dossier of ['INBOX', 'Sent']) {
    resultats.push(await syncFolder(dossier));
  }
  // 207 : un dossier a pu échouer sans que l'autre soit perdu.
  const erreurs = resultats.filter(r => r.erreur);
  return NextResponse.json({ ok: erreurs.length === 0, resultats }, { status: erreurs.length ? 207 : 200 });
}
