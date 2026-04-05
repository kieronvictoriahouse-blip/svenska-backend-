import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  const { data, error } = await supabaseAdmin.from('cms_home').select('*').order('key');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cms: data || [] });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { key, value_fr, value_sv, value_en } = body;
  const { data, error } = await supabaseAdmin
    .from('cms_home')
    .update({ value_fr, value_sv, value_en, updated_at: new Date().toISOString() })
    .eq('key', key)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const updates = body.updates as { key: string; value_fr: string; value_sv: string; value_en: string }[];
  for (const u of updates) {
    await supabaseAdmin.from('cms_home').update({
      value_fr: u.value_fr, value_sv: u.value_sv, value_en: u.value_en,
      updated_at: new Date().toISOString()
    }).eq('key', u.key);
  }
  return NextResponse.json({ success: true });
}
