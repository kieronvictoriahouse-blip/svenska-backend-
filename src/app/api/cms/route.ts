import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

async function requireAuth(req: NextRequest) {
  const h = req.headers.get('Authorization');
  if (!h?.startsWith('Bearer ')) return null;
  const { data: { user } } = await supabaseAdmin.auth.getUser(h.slice(7));
  return user;
}

const DEFAULT_ROWS = [
  { key: 'hero_eyebrow',    label: 'Hero – Eyebrow',                      type: 'text',  value_fr: 'British & Nordic Pantry',    value_sv: 'British & Nordic Pantry',    value_en: 'British & Nordic Pantry' },
  { key: 'hero_title',      label: 'Hero – Titre',                        type: 'text',  value_fr: 'L\'épicerie <em>du Nord</em>', value_sv: 'Nordisk & brittisk <em>delikatessen</em>', value_en: 'The Nordic & British <em>pantry</em>' },
  { key: 'hero_subtitle',   label: 'Hero – Sous-titre',                   type: 'text',  value_fr: 'Le meilleur de la Scandinavie et des îles britanniques — épices, conserves, biscuits iconiques et spécialités authentiques, livrés en France.', value_sv: 'Det bästa från Skandinavien och de brittiska öarna — kryddor, konserver, klassiska kex och autentiska specialiteter, levererade till Frankrike.', value_en: 'The best of Scandinavia and the British Isles — spices, preserves, iconic biscuits and authentic specialities, delivered across France.' },
  { key: 'hero_image',      label: 'Hero – Photo de fond',                type: 'image', value_fr: '', value_sv: '', value_en: '' },
  { key: 'editorial_image', label: 'Section produits – Photo éditoriale', type: 'image', value_fr: 'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=800&q=85', value_sv: 'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=800&q=85', value_en: 'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=800&q=85' },
  { key: 'feature_image',   label: 'Feature band – Photo de fond',        type: 'image', value_fr: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=900&q=85', value_sv: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=900&q=85', value_en: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=900&q=85' },
  { key: 'about_image',     label: 'Section histoire – Photo',            type: 'image', value_fr: 'https://images.unsplash.com/photo-1551183053-bf91798d047c?w=900&q=85',  value_sv: 'https://images.unsplash.com/photo-1551183053-bf91798d047c?w=900&q=85',  value_en: 'https://images.unsplash.com/photo-1551183053-bf91798d047c?w=900&q=85' },
];

export async function GET() {
  const { data, error } = await supabaseAdmin.from('cms_home').select('*').order('key');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const existing = data || [];
  const existingKeys = new Set(existing.map((r: any) => r.key));
  const missing = DEFAULT_ROWS.filter(r => !existingKeys.has(r.key));
  if (missing.length > 0) {
    await supabaseAdmin.from('cms_home').insert(missing);
    const { data: refreshed } = await supabaseAdmin.from('cms_home').select('*').order('key');
    return NextResponse.json({ cms: refreshed || [] });
  }

  return NextResponse.json({ cms: existing });
}

export async function PUT(req: NextRequest) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const body = await req.json();
  const { key, value_fr, value_sv, value_en } = body;
  if (!key) return NextResponse.json({ error: 'key requis' }, { status: 400 });

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
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const body = await req.json();
  const updates = body.updates as { key: string; value_fr: string; value_sv: string; value_en: string }[];
  if (!Array.isArray(updates)) return NextResponse.json({ error: 'updates[] requis' }, { status: 400 });

  for (const u of updates) {
    await supabaseAdmin.from('cms_home').update({
      value_fr: u.value_fr, value_sv: u.value_sv, value_en: u.value_en,
      updated_at: new Date().toISOString()
    }).eq('key', u.key);
  }
  return NextResponse.json({ success: true });
}
