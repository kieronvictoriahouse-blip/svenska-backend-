import { NextRequest, NextResponse } from 'next/server';
import { cp, depot } from '../../../lib/cp-db';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/* ═══════════════════════════════════════════════════════════════
   TICK — le battement de cœur de l'usine (cron, toutes les minutes)

   Deux métiers, dans cet ordre :

   1. PROVISIONNER — une instance à la fois, la plus ancienne
      d'abord : les API de création limitent les rafales, et une
      file lente qui aboutit vaut mieux qu'une rafale qui laisse
      trois boutiques à moitié nées. Une instance en échec est
      reprise À SON ÉTAPE — le provisionneur est idempotent.

   2. RÉCONCILIER LES SUSPENSIONS — le webhook Stripe ne fait que
      noter le statut du client ; c'est ici qu'on compare ce statut
      à l'état RÉEL de l'instance (cp_instances.suspendue) et qu'on
      agit sur l'écart. Jamais deux fois la même action : la colonne
      n'est mise à jour qu'après que Vercel a dit oui.
   ═══════════════════════════════════════════════════════════════ */

export async function GET(req: NextRequest) {
  /* CP_CRON_SECRET pour un appel à la main ; CRON_SECRET est celui
     que Vercel Cron envoie de lui-même quand la variable existe. */
  const secrets = [process.env.CP_CRON_SECRET, process.env.CRON_SECRET].filter(Boolean);
  const auth = req.headers.get('authorization') || '';
  if (!secrets.length || !secrets.some(s => auth === `Bearer ${s}`)) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  const rapport: any = { ok: true };

  /* ── 1. Provisionnement ─────────────────────────────────────── */
  const { data: enFile } = await cp.from('cp_instances')
    .select('*, cp_clients(*)')
    .neq('etape', 'pret')
    .order('created_at', { ascending: true })
    .limit(1);

  if (enFile && enFile.length) {
    const instance = enFile[0];
    const client = (instance as any).cp_clients;
    const { avancer } = require('../../../lib/provisionneur') as {
      avancer: (i: unknown, c: unknown, d: unknown) => Promise<unknown>;
    };
    try {
      await avancer(instance, client, depot());
      rapport.provision = { instance: instance.id, etape: instance.etape };
    } catch (e: any) {
      rapport.ok = false;
      rapport.provision = { instance: instance.id, etape: instance.etape, erreur: String(e?.message || e) };
    }
  } else {
    rapport.provision = 'file vide';
  }

  /* ── 2. Réconciliation des suspensions ──────────────────────── */
  const { suspendre, reactiver } = require('../../../lib/suspension') as {
    suspendre: (i: unknown) => Promise<void>;
    reactiver: (i: unknown) => Promise<void>;
  };

  const { data: pretes } = await cp.from('cp_instances')
    .select('*, cp_clients(*)')
    .eq('etape', 'pret');

  rapport.suspensions = [];
  for (const inst of pretes || []) {
    const client = (inst as any).cp_clients;
    if (!client) continue;
    const doitEtreSuspendue = client.statut === 'suspendu' || client.statut === 'resilie';

    try {
      if (doitEtreSuspendue && !inst.suspendue) {
        await suspendre(inst);
        await cp.from('cp_instances').update({ suspendue: true }).eq('id', inst.id);
        await cp.from('cp_evenements').insert({
          instance_id: inst.id, client_id: client.id,
          type: 'suspension_posee', detail: { statut_client: client.statut },
        });
        rapport.suspensions.push({ instance: inst.id, action: 'suspendue' });
      } else if (!doitEtreSuspendue && inst.suspendue) {
        await reactiver(inst);
        await cp.from('cp_instances').update({ suspendue: false }).eq('id', inst.id);
        await cp.from('cp_evenements').insert({
          instance_id: inst.id, client_id: client.id,
          type: 'reactivation_posee', detail: { statut_client: client.statut },
        });
        rapport.suspensions.push({ instance: inst.id, action: 'reactivee' });
      }
    } catch (e: any) {
      /* L'écart persiste → le prochain tick réessaie. C'est voulu. */
      rapport.ok = false;
      rapport.suspensions.push({ instance: inst.id, erreur: String(e?.message || e) });
    }
  }

  return NextResponse.json(rapport);
}
