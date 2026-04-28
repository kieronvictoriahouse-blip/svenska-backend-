import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('cms_pages')
      .select('id, slug, title_fr, title_sv, title_en, nav_label_fr, nav_label_sv, nav_label_en, show_in_nav, is_active, sort_order')
      .eq('is_active', true)
      .order('sort_order');
    if (error) { console.error('[pages] GET:', error.message); return NextResponse.json({ pages: [] }); }
    return NextResponse.json({ pages: data || [] });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('[pages] GET exception:', msg);
    return NextResponse.json({ pages: [] });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { data, error } = await supabaseAdmin.from('cms_pages').insert(body).select().maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ page: data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
