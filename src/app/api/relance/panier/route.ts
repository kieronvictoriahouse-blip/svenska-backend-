import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

/* ═══════════════════════════════════════════════════════════════
   REPRISE D'UN PANIER — ROUTE PUBLIQUE

   Appelée par le panier de la vitrine quand un client clique sur
   « Retrouver mon panier » dans un email de relance. Le jeton du
   brouillon fait foi ; la réponse ne contient QUE de quoi reconstruire
   le panier (produits, quantités, mode de livraison, point relais
   choisi — un commerce, pas l'adresse du client) — ni adresse, ni
   téléphone, ni montant facturé.
   ═══════════════════════════════════════════════════════════════ */

/* Le panier envoie l'adresse du point en une ligne : « adresse, CP
   Ville ». On la redécoupe pour lui rendre le point tel qu'il l'avait
   choisi. Codes postaux à espace (Suède « 111 22 », Pays-Bas « 1012
   AB ») reconnus ; ailleurs, le CP est le premier mot. */
const CP_PAYS: Record<string, RegExp> = {
  SE: /^(\d{3}\s?\d{2})\s+(.+)$/,
  NL: /^(\d{4}\s?[A-Z]{2})\s+(.+)$/i,
  PT: /^(\d{4}(?:-\d{3})?)\s+(.+)$/,
};
function decouperAdresse(brut: unknown, pays: string): { adresse: string; cp: string; ville: string } {
  const s = String(brut || '').trim();
  const i = s.lastIndexOf(', ');
  if (i === -1) return { adresse: s, cp: '', ville: '' };
  const fin = s.slice(i + 2).trim();
  const m = fin.match(CP_PAYS[pays] || /^(\S+)\s+(.+)$/);
  return m
    ? { adresse: s.slice(0, i).trim(), cp: m[1], ville: m[2].trim() }
    : { adresse: s, cp: '', ville: '' };
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const [id, jeton] = String(q.get('reprise') || '').split('.');
  if (!id || !jeton) return NextResponse.json({ error: 'Lien incomplet' }, { status: 400, headers: CORS });

  const { data: o } = await supabaseAdmin
    .from('orders')
    .select('id, status, lines, delivery_mode, customer_email, recovery_token, relay_point_id, relay_point_name, relay_point_address, relay_point_pays, relay_carrier_uuid')
    .eq('id', id).maybeSingle();
  if (!o || !o.recovery_token || o.recovery_token !== jeton) {
    return NextResponse.json({ error: 'Lien invalide' }, { status: 404, headers: CORS });
  }

  let lignes: any[] = [];
  try { lignes = typeof o.lines === 'string' ? JSON.parse(o.lines) : (o.lines || []); } catch {}
  const items = (Array.isArray(lignes) ? lignes : [])
    .filter(l => l?.product_id && (Number(l.price) || 0) > 0)   // les cadeaux se regagnent au checkout
    .map(l => ({ id: l.product_id, qty: Math.max(1, Math.trunc(Number(l.qty) || 1)) }));

  // Le point relais du brouillon, pour que le client n'ait plus qu'à payer.
  let relay_point: {
    id: string; name: string; adresse: string; cp: string; ville: string; pays: string; carrier_uuid: string | null;
  } | null = null;
  if (o.delivery_mode === 'mondial_relay' && o.relay_point_id) {
    const pays = String(o.relay_point_pays || 'FR').trim().toUpperCase();
    relay_point = {
      id: String(o.relay_point_id),
      name: o.relay_point_name || '',
      ...decouperAdresse(o.relay_point_address, pays),
      pays,
      carrier_uuid: o.relay_carrier_uuid || null,
    };
  }

  return NextResponse.json({
    deja_payee: !['pending', 'abandoned', 'cancelled'].includes(o.status),
    items,
    delivery_mode: o.delivery_mode || null,
    email: o.customer_email || null,
    relay_point,
  }, { headers: { ...CORS, 'Cache-Control': 'no-store' } });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
