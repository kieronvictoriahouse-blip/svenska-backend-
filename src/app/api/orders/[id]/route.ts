import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const { data, error } = await supabaseAdmin.from('orders').select('*').eq('id', params.id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ order: data });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const { data, error } = await supabaseAdmin.from('orders')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', params.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ order: data });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  await supabaseAdmin.from('orders').update({ status: 'cancelled' }).eq('id', params.id);
  return NextResponse.json({ success: true });
}
