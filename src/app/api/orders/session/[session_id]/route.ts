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

  const { data, error } = await supabaseAdmin
    .from('orders')
    .select('id,order_number,status,customer_name,customer_email,lines,subtotal,shipping,total,shipping_address,created_at,tracking_number')
    .eq('stripe_session_id', session_id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: CORS });
  if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: CORS });

  return NextResponse.json({ order: data }, { headers: CORS });
}
