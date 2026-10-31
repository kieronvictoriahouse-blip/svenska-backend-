import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(_: NextRequest, { params }: { params: { session_id: string } }) {
  const { session_id } = params;
  if (!session_id) return NextResponse.json({ error: 'missing_session_id' }, { status: 400, headers: CORS });

  /* Route publique, sans session : elle renvoyait nom, email et adresse
     du client à quiconque tenait l'identifiant de session Stripe — or il
     figure en clair dans les liens de paiement envoyés par email et
     affichés au back-office. Même projection que /api/orders/[id]/public. */
  const { data, error } = await supabaseAdmin
    .from('orders')
    .select('id,order_number,status,delivery_mode,lines,subtotal,shipping,discount,total,created_at,currency')
    .eq('stripe_session_id', session_id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: CORS });
  if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: CORS });

  // Devise renvoyée hors EUR seulement : JSON identique pour Swedish Cravings.
  const { currency, ...reste } = data as any;
  const order = currency && currency !== 'EUR' ? { ...reste, currency } : reste;

  return NextResponse.json({ order }, { headers: CORS });
}
