import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const { data, error } = await supabaseAdmin.from('orders').select('*').eq('id', params.id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: CORS });
  return NextResponse.json({ order: data }, { headers: CORS });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401, headers: CORS });
  const body = await req.json();
  const { data, error } = await supabaseAdmin.from('orders')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', params.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ order: data });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401, headers: CORS });
  await supabaseAdmin.from('orders').update({ status: 'cancelled' }).eq('id', params.id);
  return NextResponse.json({ success: true });
}
