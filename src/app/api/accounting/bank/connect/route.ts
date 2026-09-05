import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';
import { createRequisition, gocardlessConfigured, appBaseUrl } from '@/lib/finance/gocardless';
import { ensureBridgeUser, createBridgeConnectSession, bridgeConfigured } from '@/lib/finance/bridge';
import { activeProvider, instanceUserId } from '@/lib/finance/provider';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

// POST { institution_id? } — démarre la connexion bancaire.
// Bridge : la page Connect gère le choix de la banque (pas d'institution_id).
// GoCardless : institution_id requis (choisi dans le picker).
// Renvoie { link } vers lequel rediriger l'utilisatrice.
export async function POST(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const provider = activeProvider();
  const body = await req.json().catch(() => ({}));

  try {
    if (provider === 'bridge') {
      const userUuid = await ensureBridgeUser(instanceUserId());
      // Conserve/actualise la connexion Bridge de l'instance.
      const { data: existing } = await supabaseAdmin.from('bank_connections')
        .select('id').eq('provider', 'bridge').maybeSingle();
      if (existing) await supabaseAdmin.from('bank_connections').update({ status: 'linked', meta: { user_uuid: userUuid } }).eq('id', existing.id);
      else await supabaseAdmin.from('bank_connections').insert({ provider: 'bridge', status: 'linked', institution_name: 'Bridge', meta: { user_uuid: userUuid } });

      const callback = `${appBaseUrl()}/api/accounting/bank/callback?provider=bridge`;
      const session = await createBridgeConnectSession(userUuid, callback);
      return NextResponse.json({ link: session.url, sessionId: session.id });
    }

    if (provider === 'gocardless') {
      if (!gocardlessConfigured()) return NextResponse.json({ error: 'GoCardless non configuré' }, { status: 400 });
      if (!body.institution_id) return NextResponse.json({ error: 'institution_id requis' }, { status: 400 });
      const reference = `sc-${randomUUID()}`;
      const requisition = await createRequisition(body.institution_id, reference);
      await supabaseAdmin.from('bank_connections').insert({
        provider: 'gocardless', status: 'linked',
        institution_id: body.institution_id, institution_name: body.institution_name || null,
        institution_logo: body.institution_logo || null, requisition_id: requisition.id, reference,
      });
      return NextResponse.json({ link: requisition.link, requisitionId: requisition.id });
    }

    void bridgeConfigured;
    return NextResponse.json({ error: "Aucun agrégateur configuré. Ajoute les clés Bridge (BRIDGE_CLIENT_ID / BRIDGE_CLIENT_SECRET), ou importe un relevé OFX/CSV." }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
