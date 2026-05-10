import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('marketing_automations')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ automations: data || [] });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, type, delay_hours, subject, custom_html } = body;
  const { data, error } = await supabaseAdmin
    .from('marketing_automations')
    .insert({ name, type, delay_hours: delay_hours || 24, subject: subject || null, custom_html: custom_html || null, status: 'active', sent_count: 0 })
    .select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ automation: data });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { id, ...fields } = body;
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 });
  const { error } = await supabaseAdmin
    .from('marketing_automations')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 });
  await supabaseAdmin.from('marketing_automations').delete().eq('id', id);
  return NextResponse.json({ success: true });
}
