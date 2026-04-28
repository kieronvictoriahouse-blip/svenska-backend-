import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  try {
    const { data, error } = await supabaseAdmin
      .from('cms_pages').select('*').eq('slug', params.slug).maybeSingle();
    if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ page: data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('[pages/slug] GET exception:', msg);
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: { slug: string } }) {
  try {
    const body = await req.json();
    const { data, error } = await supabaseAdmin
      .from('cms_pages')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('slug', params.slug)
      .select().maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ page: data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { slug: string } }) {
  try {
    const { error } = await supabaseAdmin.from('cms_pages').delete().eq('slug', params.slug);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
