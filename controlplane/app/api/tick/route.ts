import { NextRequest, NextResponse } from 'next/server';
import { cp, depot } from '../../../lib/cp-db';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/* ═══════════════════════════════════════════════════════════════
   TICK — le battement de cœur de l'usine (cron, toutes les minutes)

   UNE instance à la fois, la plus ancienne d'abord : les API de
   création limitent les rafales, et une file lente qui aboutit vaut
   mieux qu'une rafale qui laisse trois boutiques à moitié nées.

   Une instance en échec est reprise À SON ÉTAPE — le provisionneur
   est idempotent, c'est toute sa conception.
   ═══════════════════════════════════════════════════════════════ */

export async function GET(req: NextRequest) {
  const secret = process.env.CP_CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  const { data: enFile } = await cp.from('cp_instances')
    .select('*, cp_clients(*)')
    .neq('etape', 'pret')
    .order('created_at', { ascending: true })
    .limit(1);

  if (!enFile || !enFile.length) return NextResponse.json({ ok: true, file: 'vide' });

  const instance = enFile[0];
  const client = (instance as any).cp_clients;

  /* Module CommonJS du robot, partagé avec le CLI provisionner.js. */
  const { avancer } = require('../../../lib/provisionneur') as {
    avancer: (i: unknown, c: unknown, d: unknown) => Promise<unknown>;
  };

  try {
    await avancer(instance, client, depot());
    /* Instance prête : le client reçoit ses accès. L'email de
       bienvenue porte le mot de passe UNE fois, puis il n'existe
       plus nulle part chez nous. */
    if (instance.etape === 'pret' && (instance as any).motDePasseAdmin) {
      await cp.from('cp_evenements').insert({
        instance_id: instance.id, client_id: client.id,
        type: 'bienvenue_a_envoyer',
        detail: { email: client.email, url_admin: instance.url_admin },
      });
    }
    return NextResponse.json({ ok: true, instance: instance.id, etape: instance.etape });
  } catch (e: any) {
    return NextResponse.json({ ok: false, instance: instance.id, etape: instance.etape, erreur: String(e?.message || e) });
  }
}
