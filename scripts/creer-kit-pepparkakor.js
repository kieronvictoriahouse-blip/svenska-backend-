/* ═══════════════════════════════════════════════════════════════
   KIT PEPPARKAKOR — création en pré-commande (29/10/2026)

   Même modèle que les autres box (migration 054) : une fiche ordinaire
   + bundle_items. Contenu, deux produits déjà en base :
     · Pepparkaksdeg 500g (Gille)       — pâte à pain d'épices
     · Kristyr vit (Dr. Oetker, 125 g)   — glaçage blanc en tube

   Demandes de Kieron :
     · prix 10,90 € (= les deux à l'unité) ;
     · en PRÉ-COMMANDE (migration 065) jusqu'au 1er novembre inclus —
       on n'achète en Suède que ce qui est pré-commandé ; date
       d'expédition à poser dans l'admin quand elle sera connue ;
     · les deux produits ne sont plus affichés seuls sur le site.

   Les fiches des produits masqués n'existant plus côté site, le kit
   porte lui-même ingrédients, allergènes, conservation et valeurs
   nutritionnelles (vente à distance : informations dues avant l'achat).
   Ingrédients du glaçage relevés sur la fiche ICA « Kristyr vit 125g
   Dr. Oetker » (absents de la base) ; on les reporte aussi sur sa fiche.

   Prix d'achat des deux produits à 0 en base : PA du kit laissé à 0,
   à compléter dans l'admin.

   Idempotent sur le SKU KIT-PEPPAR.

   node scripts/creer-kit-pepparkakor.js <photo.jpg>            → simulation
   node scripts/creer-kit-pepparkakor.js <photo.jpg> --ecrire   → écriture
   ═══════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').replace(/\r/g, '');
const lire = k => ((env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1] || '')
  .trim().replace(/^["']|["']$/g, '');
const sb = createClient(lire('NEXT_PUBLIC_SUPABASE_URL'), lire('SUPABASE_SERVICE_ROLE_KEY'));
const BUCKET = lire('NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET') || 'svenska-media';

const ECRIRE = process.argv.includes('--ecrire');
const PHOTO = process.argv.slice(2).find(a => !a.startsWith('--'));

const SKU = 'KIT-PEPPAR';
const PRIX = 10.90;
const POIDS = '885 g';                 // 500 g + 125 g de produits, + carton et papier de soie
const FIN_PRECOMMANDE = '2026-11-01';  // dernier jour inclus

const PATE = { product_id: 'b27bab0f-336c-48ec-ba62-5642f388cbad', qty: 1, sv: 'Pepparkaksdeg 500g' };
const GLACAGE = { product_id: '33eaf293-0eeb-42fe-bcc5-b7188f0c74db', qty: 1, sv: 'Kristyr vit' };
const CONTENU = [PATE, GLACAGE];

/* Glaçage : informations relevées sur la fiche ICA du produit. */
const GLACAGE_INFOS = {
  ingredients_fr: 'Sucre, sirop de glucose, eau, émulsifiant (E471), conservateur (E202).',
  ingredients_sv: 'Socker, glukossirap, vatten, emulgeringsmedel (E471), konserveringsmedel (E202).',
  ingredients_en: 'Sugar, glucose syrup, water, emulsifier (E471), preservative (E202).',
  allergens_fr: 'Aucun des 14 allergènes réglementaires dans la liste d’ingrédients.',
  allergens_sv: 'Inga av de 14 allergenerna i ingredienslistan.',
  allergens_en: 'None of the 14 regulated allergens in the ingredient list.',
  storage_fr: 'À conserver au frais et au sec (entre 4 et 24 °C).',
  storage_sv: 'Förvaras svalt och torrt (4–24 °C).',
  storage_en: 'Store in a cool, dry place (4–24 °C).',
};

const r2 = v => Math.round(v * 100) / 100;
const slugify = (nom, id) => (nom || 'produit').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) + '-' + String(id).slice(0, 8);

(async () => {
  console.log(ECRIRE ? '── ÉCRITURE ──\n' : '── SIMULATION (ajouter --ecrire) ──\n');
  if (!PHOTO || !fs.existsSync(PHOTO)) throw new Error('photo introuvable : ' + (PHOTO || '(aucune)'));
  const jpeg = fs.readFileSync(PHOTO);
  if (jpeg[0] !== 0xFF || jpeg[1] !== 0xD8) throw new Error('la photo doit être un JPEG');
  if (jpeg.length > 300 * 1024) throw new Error('photo trop lourde — l\'alléger avant (1000 px max)');

  const { data: deja } = await sb.from('products').select('id, name_fr').eq('sku', SKU).maybeSingle();
  if (deja) { console.log(`Déjà créé : ${deja.name_fr} (${deja.id}) — rien à faire.`); return; }

  const { data: prods, error } = await sb.from('products').select('*').in('id', CONTENU.map(c => c.product_id));
  if (error) throw error;
  const parId = Object.fromEntries((prods || []).map(p => [p.id, p]));
  let valeur = 0;
  for (const c of CONTENU) {
    const p = parId[c.product_id];
    if (!p) throw new Error('produit absent : ' + c.sv);
    if ((p.name_sv || '').trim() !== c.sv) throw new Error(`${c.product_id} s'appelle « ${p.name_sv} », attendu « ${c.sv} »`);
    valeur += Number(p.price) * c.qty;
    console.log(`  ${c.qty} × ${p.name_fr.padEnd(40)} ${Number(p.price).toFixed(2)} €  ${p.is_active ? 'en ligne' : 'masqué'}`);
  }
  const pate = parId[PATE.product_id];
  const categorie = pate.category_id;
  const { data: cat } = await sb.from('categories').select('name_fr').eq('id', categorie).maybeSingle();
  console.log(`  Rayon du kit : ${cat ? cat.name_fr : categorie}`);
  const n = pate.nutrition || {};

  const fiche = {
    name_fr: 'Kit Pepparkakor — Biscuits de Noël suédois',
    name_sv: 'Pepparkakskit — deg och kristyr',
    name_en: 'Pepparkakor Kit — Swedish Christmas biscuits',
    subtitle_fr: 'Pâte à pain d’épices Gille 500 g + glaçage blanc Dr. Oetker',
    subtitle_sv: 'Gille pepparkaksdeg 500 g + Dr. Oetker vit kristyr',
    subtitle_en: 'Gille gingerbread dough 500 g + Dr. Oetker white icing',
    desc_fr: 'Le pepparkakor, c’est le biscuit de Noël suédois : fin, croquant, parfumé à la cannelle, au gingembre et au clou de girofle. ' +
      'Ce kit réunit la pâte à pain d’épices Gille, prête à étaler (500 g), et le glaçage blanc Dr. Oetker en tube (125 g) ' +
      'pour dessiner flocons, étoiles et petits cœurs, comme en Suède pendant l’Avent. De quoi faire une belle fournée de biscuits ' +
      'ou une maison en pain d’épices. Kit de Noël proposé uniquement en pré-commande.',
    desc_sv: 'Pepparkakor hör julen till. Kitet innehåller Gilles färdiga pepparkaksdeg (500 g) och Dr. Oetkers vita kristyr i tub (125 g) ' +
      'för att dekorera med snöflingor, stjärnor och hjärtan. Räcker till en rejäl omgång pepparkakor eller ett pepparkakshus. ' +
      'Julkit som endast säljs som förbeställning.',
    desc_en: 'Pepparkakor are the Swedish Christmas biscuits: thin, crisp and fragrant with cinnamon, ginger and cloves. ' +
      'This kit brings together Gille ready-to-roll gingerbread dough (500 g) and Dr. Oetker white icing in a tube (125 g) ' +
      'to draw snowflakes, stars and little hearts, just like in Sweden during Advent. Enough for a generous batch of biscuits ' +
      'or a gingerbread house. Christmas kit available on pre-order only.',
    usage_fr: 'Abaissez finement la pâte sur un plan fariné, découpez vos formes à l’emporte-pièce et faites cuire selon les indications de l’emballage. ' +
      'Une fois les biscuits refroidis, coupez l’embout du tube et décorez. Si le glaçage est trop ferme, plongez le tube quelques instants dans de l’eau chaude.',
    usage_sv: 'Kavla ut degen tunt på mjölat bakbord, ta ut figurer med formar och grädda enligt förpackningen. ' +
      'Låt kakorna svalna, klipp av spetsen på tuben och dekorera. Är kristyren för fast, lägg tuben en stund i varmt vatten.',
    usage_en: 'Roll the dough out thinly on a floured surface, cut out shapes and bake following the instructions on the pack. ' +
      'Once the biscuits have cooled, snip the tip of the tube and decorate. If the icing is too firm, dip the tube in hot water for a moment.',
    ingredients_fr: `Pâte à pain d’épices (Gille, 500 g) : ${pate.ingredients_fr}\n` +
      `Glaçage blanc (Dr. Oetker, 125 g) : ${GLACAGE_INFOS.ingredients_fr}\n` +
      `Valeurs nutritionnelles de la pâte pour 100 g : énergie ${n.energie || '—'} ; matières grasses ${n.graisses || '—'}, dont acides gras saturés ${n.dont_satures || '—'} ; ` +
      `glucides ${n.glucides || '—'}, dont sucres ${n.dont_sucres || '—'} ; protéines ${n.proteines || '—'} ; sel ${n.sel || '—'}.`,
    ingredients_sv: `Pepparkaksdeg (Gille, 500 g): ${pate.ingredients_sv}\nVit kristyr (Dr. Oetker, 125 g): ${GLACAGE_INFOS.ingredients_sv}`,
    ingredients_en: `Gingerbread dough (Gille, 500 g): ${pate.ingredients_en}\nWhite icing (Dr. Oetker, 125 g): ${GLACAGE_INFOS.ingredients_en}`,
    allergens_fr: 'Pâte : contient du gluten (blé) ; peut contenir des traces d’œuf, de lait et d’amande. Glaçage : ' + GLACAGE_INFOS.allergens_fr.toLowerCase(),
    allergens_sv: 'Deg: innehåller gluten (vete); kan innehålla spår av ägg, mjölk och mandel. Kristyr: ' + GLACAGE_INFOS.allergens_sv.toLowerCase(),
    allergens_en: 'Dough: contains gluten (wheat); may contain traces of egg, milk and almond. Icing: ' + GLACAGE_INFOS.allergens_en.toLowerCase(),
    storage_fr: 'Pâte : à conserver au frais. Glaçage : au frais et au sec (entre 4 et 24 °C).',
    storage_sv: 'Deg: förvaras svalt/kallt. Kristyr: förvaras svalt och torrt (4–24 °C).',
    storage_en: 'Dough: store in a cool place. Icing: store in a cool, dry place (4–24 °C).',
    nutrition: n,   // valeurs de la pâte (pour 100 g), l'élément principal du kit
    origin_fr: 'Suède', origin_sv: 'Sverige', origin_en: 'Sweden',
    weight: POIDS,
    badge: 'badge-new', is_new: true, is_bestseller: false, is_active: true,
    rating: 4.5, reviews_count: 0, sort_order: 0, pack_size: 1,
    tags: ['box', 'kit', 'noel', 'pepparkakor', 'fika'],
    sku: SKU,
    category_id: categorie,
    price: PRIX,
    cost_price: 0,
    bundle_items: CONTENU.map(({ product_id, qty }) => ({ product_id, qty })),
    track_stock: false,
    stock: null,
    preorder: true,
    preorder_end: FIN_PRECOMMANDE,
    preorder_ship_date: null,
  };
  console.log(`\n  Valeur à l'unité ${valeur.toFixed(2)} €  →  kit ${PRIX.toFixed(2)} €`);
  console.log(`  Pré-commande jusqu'au ${FIN_PRECOMMANDE} inclus, date d'expédition à poser dans l'admin`);
  console.log(`  Photo : JPEG ${(jpeg.length / 1e3).toFixed(0)} Ko`);
  console.log(`  Ensuite : glaçage complété (ingrédients, allergènes, conservation) + les 2 produits masqués du site`);

  if (!ECRIRE) { console.log('\nRien écrit — relancer avec --ecrire.'); return; }

  const fichier = `products/kit-pepparkakor-${Date.now()}.jpg`;
  const up = await sb.storage.from(BUCKET).upload(fichier, jpeg, {
    contentType: 'image/jpeg', upsert: false, cacheControl: '31536000',
  });
  if (up.error) throw new Error('photo : ' + up.error.message);
  const url = sb.storage.from(BUCKET).getPublicUrl(fichier).data.publicUrl;
  await sb.from('media').insert({
    filename: path.basename(fichier), url, size: jpeg.length, mime_type: 'image/jpeg', alt_text: fiche.name_fr,
  });

  const { data: cree, error: e2 } = await sb.from('products').insert({ ...fiche, image_url: url }).select('id').single();
  if (e2) throw new Error('fiche : ' + e2.message);
  const slug = slugify(fiche.name_fr, cree.id);
  const { error: e3 } = await sb.from('products').update({ slug }).eq('id', cree.id);
  if (e3) console.warn('  adresse non figée : ' + e3.message);
  console.log(`\nCréé : ${cree.id}\n  /produit/${slug}\n  ${url}`);

  /* Glaçage : on complète ce qui manque (sans écraser une saisie existante). */
  const g = parId[GLACAGE.product_id];
  const maj = {};
  for (const [k, v] of Object.entries(GLACAGE_INFOS)) if (!String(g[k] || '').trim()) maj[k] = v;
  if (/100 grams tub/.test(g.desc_sv || '')) maj.desc_sv = g.desc_sv.replace('100 grams tub', '125 grams tub');
  if (Object.keys(maj).length) {
    const { error: e4 } = await sb.from('products').update(maj).eq('id', GLACAGE.product_id);
    console.log(e4 ? '  glaçage : ÉCHEC ' + e4.message : `  glaçage complété : ${Object.keys(maj).join(', ')}`);
  }

  /* Les deux produits ne se vendent plus seuls : masqués du site. */
  const { error: e5 } = await sb.from('products').update({ is_active: false }).in('id', CONTENU.map(c => c.product_id));
  console.log(e5 ? '  masquage : ÉCHEC ' + e5.message : '  pâte et glaçage masqués du site');
})().catch(e => { console.error('ÉCHEC :', e.message); process.exit(1); });
