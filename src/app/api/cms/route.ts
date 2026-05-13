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
  { key: 'editorial_body1',  label: 'Section éditoriale – Texte 1',        type: 'text',  value_fr: 'Mélanges pour dips, épices, marinades et spécialités sèches — le meilleur de l\'épicerie suédoise, soigneusement sélectionné.', value_sv: 'Dipmixer, kryddor, marinader och torra specialiteter — det bästa ur det svenska köket, omsorgsfullt utvalt.', value_en: 'Dip mixes, spices, marinades and dry specialities — the best of Swedish groceries, carefully selected.' },
  { key: 'editorial_body2',  label: 'Section éditoriale – Texte 2',        type: 'text',  value_fr: 'Des saveurs authentiques, directement de Suède, livrées en France.', value_sv: 'Äkta smaker, direkt från Sverige, levererade till Frankrike.', value_en: 'Authentic flavours, direct from Sweden, delivered to France.' },
  { key: 'about_title',      label: 'Section histoire – Titre (HTML ok)',   type: 'text',  value_fr: 'Svenska Cravings,<br><em>notre histoire</em>', value_sv: 'Svenska Cravings,<br><em>vår historia</em>', value_en: 'Svenska Cravings,<br><em>our story</em>' },
  { key: 'about_body1',      label: 'Section histoire – Texte 1',          type: 'text',  value_fr: 'Suédoise installée en France, portée par l\'amour des saveurs suédoises — l\'épicerie qu\'elle cherchait et ne trouvait nulle part.', value_sv: 'Svensk kvinna bosatt i Frankrike, driven av kärleken till svenska smaker — affären hon sökte men aldrig hittade.', value_en: 'A Swede living in France, driven by a love of Swedish flavours — the shop she was looking for but could never find.' },
  { key: 'about_quote',      label: 'Section histoire – Citation',         type: 'text',  value_fr: '"Elle a décidé de la créer elle-même."', value_sv: '"Så bestämde hon sig för att skapa den själv."', value_en: '"So she decided to create it herself."' },
  { key: 'about_body2',      label: 'Section histoire – Texte 2',          type: 'text',  value_fr: 'Elle sélectionne chaque produit directement auprès de producteurs soigneusement choisis — pour l\'authenticité et la qualité de chaque référence.', value_sv: 'Hon väljer varje produkt direkt från noggrant utvalda producenter — för äkthet och kvalitet i varje referens.', value_en: 'She selects every product directly from carefully chosen producers — for authenticity and quality in every item.' },
  // Editorial intro
  { key: 'editorial_eyebrow',     label: 'Section éditoriale – Eyebrow',        type: 'text',  value_fr: 'Notre sélection',                                                                              value_sv: 'Vårt urval',                                                                           value_en: 'Our selection' },
  { key: 'editorial_title',       label: 'Section éditoriale – Titre (HTML ok)', type: 'text',  value_fr: 'L\'épicerie suédoise<br>que vous <em>cherchiez</em>',                                        value_sv: 'Den svenska delikatessen<br>du alltid <em>sökte</em>',                                  value_en: 'The Swedish pantry<br>you were <em>looking for</em>' },
  { key: 'editorial_cta',         label: 'Section éditoriale – Texte CTA',       type: 'text',  value_fr: 'Lire notre histoire →',                                                                       value_sv: 'Läs vår historia →',                                                                   value_en: 'Read our story →' },
  { key: 'editorial_badge_num',   label: 'Section éditoriale – Badge chiffre',   type: 'text',  value_fr: '20+',                                                                                         value_sv: '20+',                                                                                  value_en: '20+' },
  { key: 'editorial_badge_label', label: 'Section éditoriale – Badge libellé',   type: 'text',  value_fr: 'Produits<br>sélectionnés',                                                                    value_sv: 'Utvalda<br>produkter',                                                                 value_en: 'Selected<br>products' },
  // About stats & extras
  { key: 'about_eyebrow',         label: 'Section histoire – Eyebrow',           type: 'text',  value_fr: 'Notre histoire',                                                                              value_sv: 'Vår historia',                                                                         value_en: 'Our story' },
  { key: 'about_stat1_num',       label: 'Section histoire – Stat 1 (chiffre)',  type: 'text',  value_fr: '20+',                                                                                         value_sv: '20+',                                                                                  value_en: '20+' },
  { key: 'about_stat1_label',     label: 'Section histoire – Stat 1 (libellé)',  type: 'text',  value_fr: 'produits sélectionnés',                                                                       value_sv: 'utvalda produkter',                                                                    value_en: 'selected products' },
  { key: 'about_stat2_num',       label: 'Section histoire – Stat 2 (chiffre)',  type: 'text',  value_fr: '100%',                                                                                        value_sv: '100%',                                                                                 value_en: '100%' },
  { key: 'about_stat2_label',     label: 'Section histoire – Stat 2 (libellé)',  type: 'text',  value_fr: 'origine certifiée',                                                                           value_sv: 'certifierat ursprung',                                                                 value_en: 'certified origin' },
  { key: 'about_stat3_num',       label: 'Section histoire – Stat 3 (chiffre)',  type: 'text',  value_fr: 'France',                                                                                      value_sv: 'Frankrike',                                                                            value_en: 'France' },
  { key: 'about_stat3_label',     label: 'Section histoire – Stat 3 (libellé)',  type: 'text',  value_fr: 'livraison disponible',                                                                        value_sv: 'leverans tillgänglig',                                                                 value_en: 'delivery available' },
  { key: 'about_cta',             label: 'Section histoire – Texte CTA',         type: 'text',  value_fr: 'Lire notre histoire →',                                                                       value_sv: 'Läs vår historia →',                                                                   value_en: 'Read our story →' },
  // Promise bar
  { key: 'promise_1_title',       label: 'Promesse 1 – Titre',                   type: 'text',  value_fr: 'Livraison offerte',                                                                           value_sv: 'Fri frakt',                                                                            value_en: 'Free delivery' },
  { key: 'promise_1_desc',        label: 'Promesse 1 – Description',             type: 'text',  value_fr: 'Dès 50€ en France',                                                                          value_sv: 'Från 50€ i Frankrike',                                                                 value_en: 'From €50 in France' },
  { key: 'promise_2_title',       label: 'Promesse 2 – Titre',                   type: 'text',  value_fr: 'Saveurs authentiques',                                                                        value_sv: 'Äkta smaker',                                                                          value_en: 'Authentic flavours' },
  { key: 'promise_2_desc',        label: 'Promesse 2 – Description',             type: 'text',  value_fr: 'Directement de Suède',                                                                        value_sv: 'Direkt från Sverige',                                                                  value_en: 'Direct from Sweden' },
  { key: 'promise_3_title',       label: 'Promesse 3 – Titre',                   type: 'text',  value_fr: 'Paiement sécurisé',                                                                           value_sv: 'Säker betalning',                                                                      value_en: 'Secure payment' },
  { key: 'promise_3_desc',        label: 'Promesse 3 – Description',             type: 'text',  value_fr: 'Visa, Mastercard',                                                                            value_sv: 'Visa, Mastercard',                                                                     value_en: 'Visa, Mastercard' },
  { key: 'promise_4_title',       label: 'Promesse 4 – Titre',                   type: 'text',  value_fr: 'Emballage soigné',                                                                            value_sv: 'Omsorgsfullt förpackat',                                                               value_en: 'Carefully packaged' },
  { key: 'promise_4_desc',        label: 'Promesse 4 – Description',             type: 'text',  value_fr: 'Préparé avec soin',                                                                           value_sv: 'Förberett med omsorg',                                                                 value_en: 'Prepared with care' },
  // Ticker
  { key: 'ticker_1',              label: 'Ticker – Message 1',                   type: 'text',  value_fr: 'Livraison offerte dès 50€',                                                                   value_sv: 'Fri frakt från 50€',                                                                   value_en: 'Free delivery from €50' },
  { key: 'ticker_2',              label: 'Ticker – Message 2',                   type: 'text',  value_fr: 'Saveurs suédoises authentiques',                                                              value_sv: 'Äkta svenska smaker',                                                                  value_en: 'Authentic Swedish flavours' },
  { key: 'ticker_3',              label: 'Ticker – Message 3',                   type: 'text',  value_fr: 'Sans conservateurs',                                                                          value_sv: 'Utan konserveringsmedel',                                                               value_en: 'No preservatives' },
  { key: 'ticker_4',              label: 'Ticker – Message 4',                   type: 'text',  value_fr: 'Fondée par une Suédoise en France',                                                           value_sv: 'Grundad av en Svensk i Frankrike',                                                     value_en: 'Founded by a Swede in France' },
  { key: 'ticker_5',              label: 'Ticker – Message 5',                   type: 'text',  value_fr: 'Paiement sécurisé',                                                                           value_sv: 'Säker betalning',                                                                      value_en: 'Secure payment' },
  // Newsletter
  { key: 'nl_title',              label: 'Newsletter – Titre (HTML ok)',          type: 'text',  value_fr: 'Recevez nos <em>nouveautés</em>',                                                             value_sv: 'Få våra <em>nyheter</em>',                                                             value_en: 'Get our <em>news</em>' },
  { key: 'nl_subtitle',           label: 'Newsletter – Sous-titre',              type: 'text',  value_fr: 'Recettes suédoises, nouveaux produits, offres exclusives — directement dans votre boîte mail.', value_sv: 'Svenska recept, nya produkter, exklusiva erbjudanden — direkt i din inkorg.',        value_en: 'Swedish recipes, new products, exclusive offers — directly in your inbox.' },
  { key: 'nl_btn',                label: 'Newsletter – Texte bouton',            type: 'text',  value_fr: 'S\'inscrire',                                                                                  value_sv: 'Prenumerera',                                                                          value_en: 'Subscribe' },
  { key: 'season_eyebrow',     label: 'Section saison – Eyebrow',              type: 'text',  value_fr: 'Sélection de saison', value_sv: 'Säsongsurval', value_en: 'Seasonal selection' },
  { key: 'season_title',       label: 'Section saison – Titre (HTML ok)',       type: 'text',  value_fr: 'Les saveurs du <em>printemps nordique</em>', value_sv: 'Smakerna från <em>det nordiska våret</em>', value_en: 'The flavours of <em>Nordic spring</em>' },
  { key: 'season_body',        label: 'Section saison – Texte',                 type: 'text',  value_fr: 'Herbes fraîches, épices douces et produits de saison — la Scandinavie célèbre le retour du soleil. Une sélection pour cuisiner avec l\'esprit du Midsommar.', value_sv: 'Färska örter, milda kryddor och säsongens smaker — Skandinavien firar solens återkomst. Ett urval för att laga mat med Midsommars anda.', value_en: 'Fresh herbs, gentle spices and seasonal produce — Scandinavia celebrates the return of the sun. A selection to cook with the spirit of Midsommar.' },
  { key: 'season_cta_label',   label: 'Section saison – Texte du bouton',       type: 'text',  value_fr: 'Explorer la sélection →', value_sv: 'Utforska urvalet →', value_en: 'Explore the selection →' },
  { key: 'season_cta_url',     label: 'Section saison – Lien du bouton',        type: 'text',  value_fr: 'boutique.html', value_sv: 'boutique.html', value_en: 'boutique.html' },
  { key: 'season_stat1_num',   label: 'Section saison – Stat 1 (chiffre)',      type: 'text',  value_fr: '20+', value_sv: '20+', value_en: '20+' },
  { key: 'season_stat1_label', label: 'Section saison – Stat 1 (libellé)',      type: 'text',  value_fr: 'références de saison', value_sv: 'säsongsprodukter', value_en: 'seasonal products' },
  { key: 'season_stat2_num',   label: 'Section saison – Stat 2 (chiffre)',      type: 'text',  value_fr: '100%', value_sv: '100%', value_en: '100%' },
  { key: 'season_stat2_label', label: 'Section saison – Stat 2 (libellé)',      type: 'text',  value_fr: 'origine certifiée', value_sv: 'certifierat ursprung', value_en: 'certified origin' },
  { key: 'season_stat3_num',   label: 'Section saison – Stat 3 (chiffre)',      type: 'text',  value_fr: 'France', value_sv: 'Frankrike', value_en: 'France' },
  { key: 'season_stat3_label', label: 'Section saison – Stat 3 (libellé)',      type: 'text',  value_fr: 'livraison disponible', value_sv: 'leverans tillgänglig', value_en: 'delivery available' },
  { key: 'season_image',       label: 'Section saison – Photo de fond',         type: 'image', value_fr: '', value_sv: '', value_en: '' },
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
