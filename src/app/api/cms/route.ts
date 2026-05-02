import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

async function requireAuth(req: NextRequest) {
  const h = req.headers.get('Authorization');
  if (!h?.startsWith('Bearer ')) return null;
  const { data: { user } } = await supabaseAdmin.auth.getUser(h.slice(7));
  return user;
}

const DEFAULT_ROWS = [
  { key: 'hero_eyebrow',    label: 'Hero – Eyebrow',                      type: 'text',  value_fr: 'Nordic Pantry',    value_sv: 'Nordic Pantry',    value_en: 'Nordic Pantry' },
  { key: 'hero_title',      label: 'Hero – Titre',                        type: 'text',  value_fr: 'L\'épicerie <em>du Nord</em>', value_sv: 'Nordisk <em>delikatessen</em>', value_en: 'The Nordic <em>pantry</em>' },
  { key: 'hero_subtitle',   label: 'Hero – Sous-titre',                   type: 'text',  value_fr: 'Le meilleur de la Scandinavie — épices, conserves, biscuits iconiques et spécialités suédoises authentiques, livrés en France.', value_sv: 'Det bästa från Skandinavien — kryddor, konserver, klassiska kex och autentiska svenska specialiteter, levererade till Frankrike.', value_en: 'The best of Scandinavia — spices, preserves, iconic biscuits and authentic Swedish specialities, delivered across France.' },
  { key: 'hero_image',      label: 'Hero – Photo de fond',                type: 'image', value_fr: '', value_sv: '', value_en: '' },
  { key: 'editorial_image', label: 'Section produits – Photo éditoriale', type: 'image', value_fr: 'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=800&q=85', value_sv: 'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=800&q=85', value_en: 'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=800&q=85' },
  { key: 'feature_image',   label: 'Feature band – Photo de fond',        type: 'image', value_fr: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=900&q=85', value_sv: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=900&q=85', value_en: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=900&q=85' },
  { key: 'about_image',       label: 'Section histoire – Photo',            type: 'image', value_fr: 'https://images.unsplash.com/photo-1551183053-bf91798d047c?w=900&q=85',  value_sv: 'https://images.unsplash.com/photo-1551183053-bf91798d047c?w=900&q=85',  value_en: 'https://images.unsplash.com/photo-1551183053-bf91798d047c?w=900&q=85' },
  { key: 'editorial_body1',  label: 'Section éditoriale – Texte 1',        type: 'text',  value_fr: 'Une épicerie spécialisée, fondée par passion — la boutique que vous cherchiez.', value_sv: 'En specialbutik, grundad med passion — butiken du letade efter.', value_en: 'A specialist shop, founded with passion — the store you were looking for.' },
  { key: 'editorial_body2',  label: 'Section éditoriale – Texte 2',        type: 'text',  value_fr: 'Épices, conserves, confiseries — une sélection soigneuse livrée en Europe.', value_sv: 'Kryddor, konserver, konfektyr — ett noggrant urval levererat i Europa.', value_en: 'Spices, preserves, confectionery — a careful selection delivered across Europe.' },
  { key: 'about_body1',      label: 'Section histoire – Texte 1',          type: 'text',  value_fr: 'Une boutique fondée par amour des saveurs — l\'épicerie qu\'on cherchait sans la trouver.', value_sv: 'En butik grundad av kärlek till smaker — affären man sökte utan att hitta.', value_en: 'A shop founded out of a love of flavours — the grocery store we were looking for but could never find.' },
  { key: 'about_quote',      label: 'Section histoire – Citation',         type: 'text',  value_fr: '"Une passion devenue boutique."', value_sv: '"En passion som blev en butik."', value_en: '"A passion turned into a shop."' },
  { key: 'about_body2',      label: 'Section histoire – Texte 2',          type: 'text',  value_fr: 'Chaque produit est sélectionné directement auprès de producteurs soigneusement choisis pour garantir authenticité et qualité.', value_sv: 'Varje produkt väljs direkt från noggrant utvalda producenter för att garantera äkthet och kvalitet.', value_en: 'Every product is selected directly from carefully chosen producers to guarantee authenticity and quality.' },
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
