/* ═══════════════════════════════════════════════════════════════
   PRÉ-COMMANDES DE NOËL 2026 — kit Pepparkakor + Gräddost (29/10/2026)

   Demandes de Kieron :
     · pré-commandes jusqu'au 1er novembre inclus, expédition à partir
       du 13 novembre, pour le kit ET le Gräddost ;
     · photo du kit : la photo « famille » de la bannière (l'ancienne
       photo du kit passe en photo secondaire) ;
     · Gräddost (masqué jusqu'ici) remis en ligne, en pré-commande ;
     · bannières d'accueil Pepparkakor et Gräddost (handoff du 28/10)
       en tête du carrousel jusqu'au 1er novembre.

   Bannières : diapositives « Code HTML » (migration 061), même gabarit
   que les bannières déjà en ligne : document complet, CSS commun
   intégré, liseré or en bas du cadre (body::after, comme les autres —
   le liseré intégré au design est retiré pour ne pas le doubler),
   photo servie par le site (img/bannieres/). Le texte du handoff
   annonçait « jusqu'au 6 novembre » : corrigé en 1er novembre, avec la
   date d'expédition. Versions EN et SV traduites ici.

   Idempotent : une bannière déjà présente (même photo) n'est pas
   recréée ; les mises à jour produit sont rejouables.

   node scripts/precommandes-noel-2026.js <dossier html du handoff> <photo-kit.jpg>            → simulation
   node scripts/precommandes-noel-2026.js <dossier html du handoff> <photo-kit.jpg> --ecrire   → écriture
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
const [DOSSIER, PHOTO_KIT] = process.argv.slice(2).filter(a => !a.startsWith('--'));

const FIN = '2026-11-01';
const EXPEDITION = '2026-11-13';
const DEBUT_BANNIERES = '2026-10-29';
const SITE = 'https://www.swedishcravings.fr';

const KIT = '0739b975-fe3f-4580-87f6-ec3077e8458a';
const GRADDOST = '42fd5043-b84e-4aef-ada7-ef8f383df907';

/* Gabarit des bannières en ligne : CSS commun + règles du cadre. */
const CSS_CADRE = `html,body{height:100%}
body{background:#2f3a2a;display:flex;flex-direction:column;justify-content:center}
body::after{content:'';position:fixed;left:0;right:0;bottom:0;height:6px;background:#a48c5c}
@media (max-width:767px),(orientation:portrait){.sc-hero__v--d{display:none}.sc-hero__v--m{display:block}}`;

/* Remplacement exact : chaque texte source doit exister (sinon le
   handoff a changé et la traduction serait fausse). */
function rep(html, paires) {
  for (const [de, vers] of paires) {
    if (!html.includes(de)) throw new Error('texte introuvable dans la bannière : ' + de.slice(0, 70));
    html = html.split(de).join(vers);
  }
  return html;
}

const COMMUN_FR = [
  ['Précommande · Jusqu’au 6 novembre', 'Précommande · Jusqu’au 1er novembre'],
  ['Précommandes jusqu’au 6 novembre 2026 inclus.', 'Précommandes jusqu’au 1er novembre 2026 inclus, expédition à partir du 13 novembre.'],
];
const COMMUN = {
  en: [
    ['Précommande · Jusqu’au 1er novembre', 'Pre-order · Until 1 November'],
    ['Précommandes jusqu’au 1er novembre 2026 inclus, expédition à partir du 13 novembre.', 'Pre-orders until 1 November 2026 inclusive, shipping from 13 November.'],
    ['Je précommande', 'Pre-order now'],
    ['Toute la boutique', 'The whole shop'],
  ],
  sv: [
    ['Précommande · Jusqu’au 1er novembre', 'Förbeställning · Till och med 1 november'],
    ['Précommandes jusqu’au 1er novembre 2026 inclus, expédition à partir du 13 novembre.', 'Förbeställning till och med 1 november 2026, skickas från 13 november.'],
    ['Je précommande', 'Förbeställ'],
    ['Toute la boutique', 'Hela butiken'],
  ],
};

const BANNIERES = [
  {
    fichier: 'banniere-pepparkakor.html', photo: 'pepparkakor-famille.jpg', ordre: -3,
    lien: '/produit/kit-pepparkakor-biscuits-de-noel-suedois-0739b975',
    alt: {
      fr: 'Une maman et ses enfants découpent des pepparkakor dans la cuisine',
      en: 'A mother and her children cutting out pepparkakor in the kitchen',
      sv: 'En mamma och hennes barn tar ut pepparkakor i köket',
    },
    textes: {
      en: [
        ['aria-label="Le kit pepparkakor — précommande"', 'aria-label="The pepparkakor kit — pre-order"'],
        ['Le kit<br>pepparkakor', 'The pepparkakor<br>kit'],
        ['pâte prête à l’emploi &amp; glaçage', 'ready-to-use dough &amp; icing'],
        ['Des petites mains pleines de farine, de la musique de Noël et l’odeur des biscuits tout juste sortis du four. Pâte 500&nbsp;g + tube de glaçage&nbsp;: <b style="font-weight:600">10,90&nbsp;€</b>.',
          'Little hands covered in flour, Christmas music and the smell of biscuits fresh from the oven. 500&nbsp;g of dough + a tube of icing: <b style="font-weight:600">€10.90</b>.'],
      ],
      sv: [
        ['aria-label="Le kit pepparkakor — précommande"', 'aria-label="Pepparkakskit — förbeställning"'],
        ['Le kit<br>pepparkakor', 'Pepparkakskit'],
        ['pâte prête à l’emploi &amp; glaçage', 'färdig deg &amp; kristyr'],
        ['Des petites mains pleines de farine, de la musique de Noël et l’odeur des biscuits tout juste sortis du four. Pâte 500&nbsp;g + tube de glaçage&nbsp;: <b style="font-weight:600">10,90&nbsp;€</b>.',
          'Små händer fulla av mjöl, julmusik och doften av nygräddade pepparkakor. Deg 500&nbsp;g + tub med kristyr: <b style="font-weight:600">10,90&nbsp;€</b>.'],
      ],
    },
  },
  {
    fichier: 'banniere-graddost.html', photo: 'graddost-frukost.jpg', ordre: -2,
    lien: '/produit/fromage-suedois-42fd5043',
    alt: {
      fr: 'Petit-déjeuner scandinave avec du Gräddost, du pain complet et du café',
      en: 'Scandinavian breakfast with Gräddost, wholegrain bread and coffee',
      sv: 'Skandinavisk frukost med gräddost, fullkornsbröd och kaffe',
    },
    textes: {
      en: [
        ['aria-label="Gräddost — précommande"', 'aria-label="Gräddost — pre-order"'],
        ['le fromage du petit-déjeuner suédois', 'the Swedish breakfast cheese'],
        ['En Scandinavie, le petit-déjeuner prend son temps&nbsp;: du pain complet, une fine tranche de fromage, un café bien chaud. 400&nbsp;g&nbsp;: <b style="font-weight:600">7,19&nbsp;€</b>.',
          'In Scandinavia, breakfast takes its time: wholegrain bread, a thin slice of cheese, a hot cup of coffee. 400&nbsp;g: <b style="font-weight:600">€7.19</b>.'],
      ],
      sv: [
        ['aria-label="Gräddost — précommande"', 'aria-label="Gräddost — förbeställning"'],
        ['le fromage du petit-déjeuner suédois', 'den svenska frukostosten'],
        ['En Scandinavie, le petit-déjeuner prend son temps&nbsp;: du pain complet, une fine tranche de fromage, un café bien chaud. 400&nbsp;g&nbsp;: <b style="font-weight:600">7,19&nbsp;€</b>.',
          'I Skandinavien får frukosten ta sin tid: fullkornsbröd, en tunn skiva ost och en kopp varmt kaffe. 400&nbsp;g: <b style="font-weight:600">7,19&nbsp;€</b>.'],
      ],
    },
  },
];

function documentBanniere(b, css, lang) {
  const src = fs.readFileSync(path.join(DOSSIER, b.fichier), 'utf8').replace(/\r/g, '');
  const m = src.match(/<section class="sc-hero"[\s\S]*?<\/section>/);
  if (!m) throw new Error('section introuvable : ' + b.fichier);
  let s = m[0]
    .replace(/<div style="position:absolute;left:0;right:0;bottom:0;height:[0-9.]+cqw;background:#a48c5c"><\/div>\n?/g, '')
    .split(`src="images/${b.photo}"`).join(`src="${SITE}/img/bannieres/${b.photo}"`)
    .split('<a class="btn" href="https://www.swedishcravings.fr"').join(`<a class="btn" href="${b.lien}"`)
    .split('<a class="lnk" href="https://www.swedishcravings.fr"').join('<a class="lnk" href="/boutique"');
  if (/https:\/\/www\.swedishcravings\.fr"/.test(s)) throw new Error('lien non remplacé : ' + b.fichier);
  s = rep(s, COMMUN_FR);
  if (lang !== 'fr') {
    s = rep(s, [[`alt="${b.alt.fr}"`, `alt="${b.alt[lang]}"`], ...b.textes[lang], ...COMMUN[lang]]);
  }
  if (/précommande|Précommande|Jusqu’au 6/.test(lang === 'fr' ? s.replace(/[Pp]récommande/g, '') : s)) {
    throw new Error(`texte français resté dans la version ${lang} : ${b.fichier}`);
  }
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;1,400&family=Montserrat:wght@400;600&display=swap">
<style>
${css.trim()}
${CSS_CADRE}
</style>
</head>
<body>
${s}
</body>
</html>`;
}

(async () => {
  console.log(ECRIRE ? '── ÉCRITURE ──\n' : '── SIMULATION (ajouter --ecrire) ──\n');
  if (!DOSSIER || !fs.existsSync(path.join(DOSSIER, 'bannieres.css'))) throw new Error('dossier html du handoff introuvable');
  if (!PHOTO_KIT || !fs.existsSync(PHOTO_KIT)) throw new Error('photo du kit introuvable');
  const jpeg = fs.readFileSync(PHOTO_KIT);
  if (jpeg[0] !== 0xFF || jpeg[1] !== 0xD8 || jpeg.length > 300 * 1024) throw new Error('photo du kit : JPEG de 300 Ko max attendu');
  const css = fs.readFileSync(path.join(DOSSIER, 'bannieres.css'), 'utf8').replace(/\r/g, '');

  // 1) Bannières : construction (contrôle des textes dès la simulation)
  const lignes = BANNIERES.map(b => ({
    sort_order: b.ordre, is_active: true, kind: 'html',
    image_url: `${SITE}/img/bannieres/${b.photo}`,
    alt_fr: b.alt.fr, alt_en: b.alt.en, alt_sv: b.alt.sv,
    html_fr: documentBanniere(b, css, 'fr'),
    html_en: documentBanniere(b, css, 'en'),
    html_sv: documentBanniere(b, css, 'sv'),
    html_fit: 'fill', html_width: 1920, html_height: 720, theme: 'moss',
    starts_on: DEBUT_BANNIERES, ends_on: FIN,
  }));
  for (const l of lignes) console.log(`  bannière ${l.image_url.split('/').pop()} : FR ${l.html_fr.length} car., EN ${l.html_en.length}, SV ${l.html_sv.length}, du ${l.starts_on} au ${l.ends_on}`);

  const { data: prods } = await sb.from('products').select('id, name_fr, image_url, extra_images, is_active, preorder, preorder_end, preorder_ship_date').in('id', [KIT, GRADDOST]);
  const kit = prods.find(p => p.id === KIT), gr = prods.find(p => p.id === GRADDOST);
  if (!kit || !gr) throw new Error('kit ou Gräddost introuvable');
  console.log(`  kit : expédition ${kit.preorder_ship_date || '—'} → ${EXPEDITION}, photo famille (l'ancienne en secondaire)`);
  console.log(`  Gräddost : ${gr.is_active ? 'en ligne' : 'masqué'} → en ligne, pré-commande jusqu'au ${FIN}, expédition ${EXPEDITION}`);

  if (!ECRIRE) {
    fs.writeFileSync(path.join(path.dirname(PHOTO_KIT), 'apercu-banniere-pepparkakor-sv.html'), lignes[0].html_sv);
    fs.writeFileSync(path.join(path.dirname(PHOTO_KIT), 'apercu-banniere-graddost-fr.html'), lignes[1].html_fr);
    console.log('\nRien écrit — relancer avec --ecrire.');
    return;
  }

  // 2) Kit : photo + date d'expédition
  const fichier = `products/kit-pepparkakor-famille-${Date.now()}.jpg`;
  const up = await sb.storage.from(BUCKET).upload(fichier, jpeg, { contentType: 'image/jpeg', upsert: false, cacheControl: '31536000' });
  if (up.error) throw new Error('photo : ' + up.error.message);
  const url = sb.storage.from(BUCKET).getPublicUrl(fichier).data.publicUrl;
  await sb.from('media').insert({ filename: path.basename(fichier), url, size: jpeg.length, mime_type: 'image/jpeg', alt_text: kit.name_fr });
  const extras = (Array.isArray(kit.extra_images) ? kit.extra_images : []).filter(u => u !== kit.image_url);
  const e1 = (await sb.from('products').update({
    image_url: url, extra_images: [kit.image_url, ...extras], preorder_ship_date: EXPEDITION,
  }).eq('id', KIT)).error;
  console.log(e1 ? '  kit : ÉCHEC ' + e1.message : `  kit mis à jour\n    ${url}`);

  // 3) Gräddost en pré-commande
  const e2 = (await sb.from('products').update({
    is_active: true, preorder: true, preorder_end: FIN, preorder_ship_date: EXPEDITION,
  }).eq('id', GRADDOST)).error;
  console.log(e2 ? '  Gräddost : ÉCHEC ' + e2.message : '  Gräddost en ligne, en pré-commande');

  // 4) Bannières (pas de doublon)
  for (const l of lignes) {
    const { data: deja } = await sb.from('home_slides').select('id').eq('image_url', l.image_url).maybeSingle();
    if (deja) { console.log(`  bannière déjà présente : ${l.image_url}`); continue; }
    const { error } = await sb.from('home_slides').insert(l);
    console.log(error ? '  bannière : ÉCHEC ' + error.message : `  bannière créée : ${l.image_url.split('/').pop()}`);
  }
})().catch(e => { console.error('ÉCHEC :', e.message); process.exit(1); });
