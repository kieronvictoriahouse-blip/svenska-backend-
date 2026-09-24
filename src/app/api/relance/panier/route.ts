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
   le panier (produits, quantités, mode de livraison) — ni adresse, ni
   téléphone, ni montant facturé.
   ═══════════════════════════════════════════════════════════════ */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const [id, jeton] = String(q.get('reprise') || '').split('.');
  if (!id || !jeton) return NextResponse.json({ error: 'Lien incomplet' }, { status: 400, headers: CORS });

  const { data: o } = await supabaseAdmin
    .from('orders').select('id, status, lines, delivery_mode, customer_email, recovery_token')
    .eq('id', id).maybeSingle();
  if (!o || !o.recovery_token || o.recovery_token !== jeton) {
    return NextResponse.json({ error: 'Lien invalide' }, { status: 404, headers: CORS });
  }

  let lignes: any[] = [];
  try { lignes = typeof o.lines === 'string' ? JSON.parse(o.lines) : (o.lines || []); } catch {}
  const items = (Array.isArray(lignes) ? lignes : [])
    .filter(l => l?.product_id && (Number(l.price) || 0) > 0)   // les cadeaux se regagnent au checkout
    .map(l => ({ id: l.product_id, qty: Math.max(1, Math.trunc(Number(l.qty) || 1)) }));

  return NextResponse.json({
    deja_payee: !['pending', 'abandoned', 'cancelled'].includes(o.status),
    items,
    delivery_mode: o.delivery_mode || null,
    email: o.customer_email || null,
  }, { headers: { ...CORS, 'Cache-Control': 'no-store' } });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
