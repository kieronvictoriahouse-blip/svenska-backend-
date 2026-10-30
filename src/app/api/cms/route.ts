import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
// Contrôle commun (comptes admin seulement) : la copie locale acceptait tout compte Supabase.
import { requireAuth } from '@/lib/auth';
import { BOUTIQUE_DEFAUT, boutiqueDeRequete, codeBoutique } from '@/lib/boutique';

/* Boutique nommée par l'appel (?boutique=, en-tête x-boutique) ou, pour une
   écriture, par le corps. null = aucune : comportement d'avant. */
function boutiqueNommee(req: NextRequest, body?: any): string | null {
  if (typeof body?.boutique_id === 'string' && body.boutique_id.trim()) return codeBoutique(body.boutique_id);
  if (req.nextUrl.searchParams.has('boutique') || req.headers.has('x-boutique')) return boutiqueDeRequete(req);
  return null;
}

const DEFAULT_ROWS = [
  { key: 'hero_eyebrow',    label: 'Hero – Eyebrow',                      type: 'text',  value_fr: 'Épicerie suédoise', value_sv: 'Svenskt skafferi', value_en: 'Nordic Pantry' },
  { key: 'hero_title',      label: 'Hero – Titre',                        type: 'text',  value_fr: 'L\'épicerie <em>suédoise</em> en ligne', value_sv: 'Svenskt <em>skafferi</em> på nätet', value_en: 'The Swedish <em>pantry</em> online' },
  { key: 'hero_subtitle',   label: 'Hero – Sous-titre',                   type: 'text',  value_fr: 'Le meilleur de la Suède — bonbons, chocolat, fika, chips et dips, livrés en France.', value_sv: 'Det bästa från Sverige — godis, choklad, fika, chips och dippmix, levererat till Frankrike.', value_en: 'The best of Sweden — sweets, chocolate, fika, crisps and dips, delivered across France.' },
  { key: 'hero_image',      label: 'Hero – Photo de fond',                type: 'image', value_fr: '', value_sv: '', value_en: '' },
  { key: 'editorial_image', label: 'Section produits – Photo éditoriale', type: 'image', value_fr: 'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=800&q=85', value_sv: 'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=800&q=85', value_en: 'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=800&q=85' },
  { key: 'feature_image',   label: 'Feature band – Photo de fond',        type: 'image', value_fr: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=900&q=85', value_sv: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=900&q=85', value_en: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=900&q=85' },
  { key: 'about_image',       label: 'Section histoire – Photo',            type: 'image', value_fr: 'https://images.unsplash.com/photo-1551183053-bf91798d047c?w=900&q=85',  value_sv: 'https://images.unsplash.com/photo-1551183053-bf91798d047c?w=900&q=85',  value_en: 'https://images.unsplash.com/photo-1551183053-bf91798d047c?w=900&q=85' },
  { key: 'editorial_body1',  label: 'Section éditoriale – Texte 1',        type: 'text',  value_fr: 'Bonbons, chocolat, fika, chips et mélanges pour dips — le meilleur de l\'épicerie suédoise, soigneusement sélectionné.', value_sv: 'Godis, choklad, fika, chips och dippmix — det bästa ur det svenska skafferiet, omsorgsfullt utvalt.', value_en: 'Sweets, chocolate, fika, crisps and dip mixes — the best of Swedish groceries, carefully selected.' },
  { key: 'editorial_body2',  label: 'Section éditoriale – Texte 2',        type: 'text',  value_fr: 'Des saveurs authentiques, directement de Suède, livrées en France.', value_sv: 'Äkta smaker, direkt från Sverige, levererade till Frankrike.', value_en: 'Authentic flavours, direct from Sweden, delivered to France.' },
  { key: 'about_title',      label: 'Section histoire – Titre (HTML ok)',   type: 'text',  value_fr: 'Swedish Cravings,<br><em>notre histoire</em>', value_sv: 'Swedish Cravings,<br><em>vår historia</em>', value_en: 'Swedish Cravings,<br><em>our story</em>' },
  { key: 'about_body1',      label: 'Section histoire – Texte 1',          type: 'text',  value_fr: 'Depuis que je vis en France, les saveurs de la Suède me manquent — ces goûts simples du quotidien qui rendent même un repas ordinaire un peu spécial.', value_sv: 'Sedan jag flyttade till Frankrike saknar jag smakerna från Sverige — de enkla, vardagliga smakerna som gör till och med en vanlig måltid lite extra.', value_en: 'Since moving to France, I\'ve missed the flavours of Sweden — those simple, everyday tastes that make even an ordinary meal feel a little special.' },
  { key: 'about_quote',      label: 'Section histoire – Citation',         type: 'text',  value_fr: '"C\'est comme ça que tout a commencé."', value_sv: '"Det var så allt började."', value_en: '"That\'s how it all began."' },
  { key: 'about_body2',      label: 'Section histoire – Texte 2',          type: 'text',  value_fr: 'Des bonbons et du chocolat suédois, de quoi faire une vraie fika, des chips et des mélanges pour dips pour le vendredi soir, et des box à offrir — tout ce qu\'on ne trouve pas facilement en France, choisi pour vous apporter un vrai goût de Suède.', value_sv: 'Svenskt godis och choklad, allt till en riktig fika, chips och dippmix till fredagskvällen och presentlådor att ge bort — sådant man inte lätt hittar i Frankrike, utvalt för att ge dig en äkta smak av Sverige.', value_en: 'Swedish sweets and chocolate, everything for a proper fika, crisps and dip mixes for Friday night, and gift boxes — things that are hard to find in France, chosen to bring you a true taste of Sweden.' },
  // Editorial intro
  // Hero CTAs
  { key: 'hero_cta1',            label: 'Hero – Bouton principal',              type: 'text',  value_fr: 'Explorer la boutique',                                                                        value_sv: 'Utforska butiken',                                                                     value_en: 'Explore the shop' },
  { key: 'hero_cta2',            label: 'Hero – Bouton secondaire',             type: 'text',  value_fr: 'Notre histoire',                                                                              value_sv: 'Vår historia',                                                                         value_en: 'Our story' },
  // Sections produits
  { key: 'cats_eyebrow',         label: 'Catégories – Eyebrow',                 type: 'text',  value_fr: 'Notre gamme',                                                                                 value_sv: 'Våra kategorier',                                                                      value_en: 'Our range' },
  { key: 'cats_title',           label: 'Catégories – Titre (HTML ok)',          type: 'text',  value_fr: 'Épicerie <em>suédoise</em>',                                                                  value_sv: 'Svenskt <em>skafferi</em>',                                                         value_en: 'Swedish <em>pantry</em>' },
  { key: 'bs_eyebrow',           label: 'Best-sellers – Eyebrow',               type: 'text',  value_fr: 'Les préférés de nos clients',                                                                  value_sv: 'Kundernas favoriter',                                                                  value_en: 'Customer favourites' },
  { key: 'bs_title',             label: 'Best-sellers – Titre (HTML ok)',        type: 'text',  value_fr: 'Nos <em>best-sellers</em>',                                                                   value_sv: 'Våra <em>bästsäljare</em>',                                                            value_en: 'Our <em>best-sellers</em>' },
  { key: 'na_eyebrow',           label: 'Nouvelles arrivées – Eyebrow',         type: 'text',  value_fr: 'Tout juste arrivé',                                                                           value_sv: 'Just anlänt',                                                                          value_en: 'Just arrived' },
  { key: 'na_title',             label: 'Nouvelles arrivées – Titre (HTML ok)', type: 'text',  value_fr: 'Nouvelles <em>arrivées</em>',                                                                  value_sv: 'Nya <em>produkter</em>',                                                               value_en: 'New <em>arrivals</em>' },
  // Editorial intro
  { key: 'editorial_eyebrow',     label: 'Section éditoriale – Eyebrow',        type: 'text',  value_fr: 'Notre sélection',                                                                              value_sv: 'Vårt urval',                                                                           value_en: 'Our selection' },
  { key: 'editorial_title',       label: 'Section éditoriale – Titre (HTML ok)', type: 'text',  value_fr: 'L\'épicerie suédoise<br>que vous <em>cherchiez</em>',                                        value_sv: 'Det svenska skafferiet<br>du <em>letade efter</em>',                                  value_en: 'The Swedish pantry<br>you were <em>looking for</em>' },
  { key: 'editorial_cta',         label: 'Section éditoriale – Texte CTA',       type: 'text',  value_fr: 'Lire notre histoire →',                                                                       value_sv: 'Läs vår historia →',                                                                   value_en: 'Read our story →' },
  { key: 'editorial_badge_num',   label: 'Section éditoriale – Badge chiffre',   type: 'text',  value_fr: '80+',                                                                                         value_sv: '80+',                                                                                  value_en: '80+' },
  { key: 'editorial_badge_label', label: 'Section éditoriale – Badge libellé',   type: 'text',  value_fr: 'Produits<br>sélectionnés',                                                                    value_sv: 'Utvalda<br>produkter',                                                                 value_en: 'Selected<br>products' },
  // About stats & extras
  { key: 'about_eyebrow',         label: 'Section histoire – Eyebrow',           type: 'text',  value_fr: 'Notre histoire',                                                                              value_sv: 'Vår historia',                                                                         value_en: 'Our story' },
  { key: 'about_stat1_num',       label: 'Section histoire – Stat 1 (chiffre)',  type: 'text',  value_fr: '80+',                                                                                         value_sv: '80+',                                                                                  value_en: '80+' },
  { key: 'about_stat1_label',     label: 'Section histoire – Stat 1 (libellé)',  type: 'text',  value_fr: 'produits sélectionnés',                                                                       value_sv: 'utvalda produkter',                                                                    value_en: 'selected products' },
  { key: 'about_stat2_num',       label: 'Section histoire – Stat 2 (chiffre)',  type: 'text',  value_fr: '100%',                                                                                        value_sv: '100%',                                                                                 value_en: '100%' },
  { key: 'about_stat2_label',     label: 'Section histoire – Stat 2 (libellé)',  type: 'text',  value_fr: 'choisi par une Suédoise',                                                                           value_sv: 'utvalt av en svensk',                                                                 value_en: 'chosen by a Swede' },
  { key: 'about_stat3_num',       label: 'Section histoire – Stat 3 (chiffre)',  type: 'text',  value_fr: 'France',                                                                                      value_sv: 'Frankrike',                                                                            value_en: 'France' },
  { key: 'about_stat3_label',     label: 'Section histoire – Stat 3 (libellé)',  type: 'text',  value_fr: 'livraison disponible',                                                                        value_sv: 'leverans tillgänglig',                                                                 value_en: 'delivery available' },
  { key: 'about_cta',             label: 'Section histoire – Texte CTA',         type: 'text',  value_fr: 'Lire notre histoire →',                                                                       value_sv: 'Läs vår historia →',                                                                   value_en: 'Read our story →' },
  // Promise bar
  { key: 'promise_1_title',       label: 'Promesse 1 – Titre',                   type: 'text',  value_fr: 'Livraison offerte',                                                                           value_sv: 'Fri frakt',                                                                            value_en: 'Free delivery' },
  { key: 'promise_1_desc',        label: 'Promesse 1 – Description',             type: 'text',  value_fr: 'Dès 50€ en France',                                                                          value_sv: 'Från 50€ i Frankrike',                                                                 value_en: 'From €50 in France' },
  { key: 'promise_2_title',       label: 'Promesse 2 – Titre',                   type: 'text',  value_fr: 'Saveurs authentiques',                                                                        value_sv: 'Äkta smaker',                                                                          value_en: 'Authentic flavours' },
  { key: 'promise_2_desc',        label: 'Promesse 2 – Description',             type: 'text',  value_fr: 'Importés depuis la Suède',                                                                        value_sv: 'Importerat från Sverige',                                                                  value_en: 'Imported from Sweden' },
  { key: 'promise_3_title',       label: 'Promesse 3 – Titre',                   type: 'text',  value_fr: 'Paiement sécurisé',                                                                           value_sv: 'Säker betalning',                                                                      value_en: 'Secure payment' },
  { key: 'promise_3_desc',        label: 'Promesse 3 – Description',             type: 'text',  value_fr: 'CB, Apple Pay, Google Pay, en 3 ou 4 fois',                                                    value_sv: 'Kort, Apple Pay, Google Pay, delbetalning i 3 eller 4',                                 value_en: 'Card, Apple Pay, Google Pay, or pay in 3 or 4' },
  { key: 'promise_4_title',       label: 'Promesse 4 – Titre',                   type: 'text',  value_fr: 'Emballage soigné',                                                                            value_sv: 'Omsorgsfullt förpackat',                                                               value_en: 'Carefully packaged' },
  { key: 'promise_4_desc',        label: 'Promesse 4 – Description',             type: 'text',  value_fr: 'Préparé avec soin',                                                                           value_sv: 'Förberett med omsorg',                                                                 value_en: 'Prepared with care' },
  // Ticker
  { key: 'ticker_1',              label: 'Ticker – Message 1',                   type: 'text',  value_fr: 'Livraison offerte dès 50€',                                                                   value_sv: 'Fri frakt från 50€',                                                                   value_en: 'Free delivery from €50' },
  { key: 'ticker_2',              label: 'Ticker – Message 2',                   type: 'text',  value_fr: 'Saveurs suédoises authentiques',                                                              value_sv: 'Äkta svenska smaker',                                                                  value_en: 'Authentic Swedish flavours' },
  // Vide : « Sans conservateurs » était faux pour de la confiserie. La ligne reste
  // (une clé absente serait recréée) ; un message vide n'est pas affiché.
  { key: 'ticker_3',              label: 'Ticker – Message 3',                   type: 'text',  value_fr: '',                                                                                            value_sv: '',                                                                                     value_en: '' },
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
  { key: 'season_stat1_num',   label: 'Section saison – Stat 1 (chiffre)',      type: 'text',  value_fr: '80+', value_sv: '80+', value_en: '80+' },
  { key: 'season_stat1_label', label: 'Section saison – Stat 1 (libellé)',      type: 'text',  value_fr: 'références de saison', value_sv: 'säsongsprodukter', value_en: 'seasonal products' },
  { key: 'season_stat2_num',   label: 'Section saison – Stat 2 (chiffre)',      type: 'text',  value_fr: '100%', value_sv: '100%', value_en: '100%' },
  { key: 'season_stat2_label', label: 'Section saison – Stat 2 (libellé)',      type: 'text',  value_fr: 'choisi par une Suédoise', value_sv: 'utvalt av en svensk', value_en: 'chosen by a Swede' },
  { key: 'season_stat3_num',   label: 'Section saison – Stat 3 (chiffre)',      type: 'text',  value_fr: 'France', value_sv: 'Frankrike', value_en: 'France' },
  { key: 'season_stat3_label', label: 'Section saison – Stat 3 (libellé)',      type: 'text',  value_fr: 'livraison disponible', value_sv: 'leverans tillgänglig', value_en: 'delivery available' },
  { key: 'season_image',       label: 'Section saison – Photo de fond',         type: 'image', value_fr: '', value_sv: '', value_en: '' },
];

// Version des valeurs par défaut. Ne sert plus qu'à tamponner la base : une
// nouvelle version ajoute les clés manquantes et ne réécrit aucun texte existant.
const SEED_VERSION = 'v5';

export async function GET(req: NextRequest) {
  /* Vitrine : les textes de sa seule boutique (migration 066). L'écran
     « Textes d'accueil » (jeton admin valide), sans boutique demandée,
     lit tout comme avant. Un jeton refusé reçoit la vue publique : la
     lecture a toujours été ouverte. */
  const admin = !!req.headers.get('authorization') && !!(await requireAuth(req));
  const b = boutiqueDeRequete(req);
  const filtrer = !admin || boutiqueNommee(req) !== null;
  const lire = () => {
    let q = supabaseAdmin.from('cms_home').select('*');
    if (filtrer) q = q.eq('boutique_id', b);
    return q.order('key');
  };

  const { data, error } = await lire();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const existing = data || [];

  /* Autre boutique : pas d'amorçage. DEFAULT_ROWS sont les textes de
     Swedish Cravings, et `key` reste unique sur toute la table : leur
     insertion échouerait, et le tampon de version est celui de « sc ». */
  if (b !== BOUTIQUE_DEFAUT) {
    return NextResponse.json({ cms: existing.filter((r: any) => r.key !== '_seed_version') });
  }
  const existingMap = new Map(existing.map((r: any) => [r.key, r]));

  const seedRow = existingMap.get('_seed_version');
  const needsReseed = !seedRow || seedRow.value_fr !== SEED_VERSION;

  if (needsReseed) {
    /* Changement de version : on AJOUTE les clés nouvelles, on ne réécrit
       JAMAIS une clé existante. L'ancienne version remettait tous les
       textes aux valeurs par défaut — sur un simple GET public, au premier
       visiteur venu — et effaçait chaque texte retouché dans « Textes
       d'accueil ». Changer un texte déjà en base se fait dans l'écran, ou
       par une requête SQL relue, pas en touchant DEFAULT_ROWS. */
    // Insert any missing rows (text + image)
    const missing = DEFAULT_ROWS.filter(r => !existingMap.has(r.key));
    if (missing.length > 0) await supabaseAdmin.from('cms_home').insert(missing);
    // Stamp the version
    await supabaseAdmin.from('cms_home').upsert(
      { key: '_seed_version', label: 'Internal – seed version', type: 'meta', value_fr: SEED_VERSION, value_sv: SEED_VERSION, value_en: SEED_VERSION },
      { onConflict: 'key' }
    );
    const { data: refreshed } = await lire();
    return NextResponse.json({ cms: (refreshed || []).filter((r: any) => r.key !== '_seed_version') });
  }

  // Normal path: only insert rows that don't exist yet
  const missing = DEFAULT_ROWS.filter(r => !existingMap.has(r.key));
  if (missing.length > 0) {
    await supabaseAdmin.from('cms_home').insert(missing);
    const { data: refreshed } = await lire();
    return NextResponse.json({ cms: (refreshed || []).filter((r: any) => r.key !== '_seed_version') });
  }

  return NextResponse.json({ cms: existing.filter((r: any) => r.key !== '_seed_version') });
}

export async function PUT(req: NextRequest) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const body = await req.json();
  const { key, value_fr, value_sv, value_en } = body;
  if (!key) return NextResponse.json({ error: 'key requis' }, { status: 400 });

  let maj = supabaseAdmin
    .from('cms_home')
    .update({ value_fr, value_sv, value_en, updated_at: new Date().toISOString() })
    .eq('key', key);
  // Boutique nommée : on ne touche que ses textes. Sinon, comme avant.
  const bn = boutiqueNommee(req, body);
  if (bn) maj = maj.eq('boutique_id', bn);
  const { data, error } = await maj
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}

export async function POST(req: NextRequest) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const body = await req.json();
  // L'écran « Textes d'accueil » envoie { cms: [...] } ; { updates: [...] } reste accepté.
  const updates = (body.updates ?? body.cms) as { key: string; value_fr: string; value_sv: string; value_en: string }[];
  if (!Array.isArray(updates)) return NextResponse.json({ error: 'updates[] requis' }, { status: 400 });

  /* Chaque écriture est vérifiée : l'écran affichait « publié » même quand
     une mise à jour échouait. */
  const echecs: string[] = [];
  // Boutique nommée : on ne touche que ses textes. Sinon, comme avant.
  const bn = boutiqueNommee(req, body);
  for (const u of updates) {
    if (!u?.key || u.key === '_seed_version') continue;
    let maj = supabaseAdmin.from('cms_home').update({
      value_fr: u.value_fr, value_sv: u.value_sv, value_en: u.value_en,
      updated_at: new Date().toISOString()
    }).eq('key', u.key);
    if (bn) maj = maj.eq('boutique_id', bn);
    const { error } = await maj;
    if (error) echecs.push(u.key);
  }
  if (echecs.length) {
    return NextResponse.json({ error: `Textes non enregistrés : ${echecs.join(', ')}`, failed: echecs }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
