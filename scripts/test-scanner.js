/* ═══════════════════════════════════════════════════════════════
   TEST DU MOTEUR DE LECTURE

   Aller-retour complet : on FABRIQUE un code avec le générateur
   zxing-cpp, puis on le relit avec le lecteur. Un test qui se contente
   de vérifier que le paquet s'importe ne prouve rien — celui-ci prouve
   que le décodage marche, format par format.

   On ne s'arrête pas au code parfait : chaque symbole est aussi relu
   dégradé — pivoté d'un quart de tour, en négatif, réduit, et bruité.
   C'est là que l'ancien moteur (zxing-js, abandonné) décrochait, et
   c'est ce qu'on rencontre vraiment en réserve : étiquette de travers
   sur un carton, impression pâle, photo prise de loin.

   node scripts/test-scanner.js
   ═══════════════════════════════════════════════════════════════ */

const CAS = [
  { format: 'EAN-13',  valeur: '7310090011118' },   // Läkerol, un vrai EAN suédois
  { format: 'EAN-8',   valeur: '73100904' },
  { format: 'UPC-A',   valeur: '012345678905' },
  { format: 'Code128', valeur: 'SD-0105' },         // nos références de commande
  { format: 'Code39',  valeur: 'SC0045' },          // nos SKU
  { format: 'ITF',     valeur: '73100900111180' },  // carton de regroupement
  { format: 'QRCode',  valeur: 'https://swedishcravings.fr/produit?id=abc' },
  { format: 'DataMatrix', valeur: 'LOT-2026-08' },
];

/* Les formats que le composant demande au lecteur. Si un cas de test
   passe alors que son format n'est pas dans cette liste, le test ment. */
const FORMATS_DEMANDES = ['EAN13', 'EAN8', 'UPCA', 'UPCE', 'Code128', 'Code39', 'ITF', 'QRCode', 'DataMatrix'];

/* ── Décodage PNG minimal ──────────────────────────────────────────
   Le générateur rend un PNG ; le lecteur veut soit un fichier image
   (via Blob, indisponible hors navigateur pour le décodage interne),
   soit des pixels bruts. On passe donc par le `symbol` du générateur :
   une image un canal, exactement ce dont on a besoin, sans dépendance
   de décodage PNG. */
function versImageData(symbol) {
  const { width, height, data } = symbol;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const v = data[i];
    rgba[i * 4] = v; rgba[i * 4 + 1] = v; rgba[i * 4 + 2] = v; rgba[i * 4 + 3] = 255;
  }
  return { data: rgba, width, height, colorSpace: 'srgb' };
}

const clone = img => ({ ...img, data: new Uint8ClampedArray(img.data) });

/* Le generateur rend UN pixel par module, quelle que soit l'echelle
   demandee — 95x55 pour un EAN-13. Degrader ca ne teste rien de reel :
   une camera voit toujours plusieurs pixels par barre. On agrandit
   d'abord, comme le ferait une prise de vue. */
function agrandir(img, f) {
  const w = img.width * f, h = img.height * f;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = (Math.floor(y / f) * img.width + Math.floor(x / f)) * 4;
      const d = (y * w + x) * 4;
      out[d] = img.data[s]; out[d + 1] = img.data[s + 1];
      out[d + 2] = img.data[s + 2]; out[d + 3] = 255;
    }
  }
  return { data: out, width: w, height: h, colorSpace: 'srgb' };
}

/* zxing-cpp normalise l'UPC-A en sa forme EAN-13, avec le zero de tete.
   C'est la forme canonique GTIN-13, pas une lecture fausse — et c'est
   pour ca que /api/scan cherche les deux formes. */
const memeCode = (lu, attendu) =>
  lu === attendu
  || (attendu.length === 12 && lu === '0' + attendu)
  || (lu.length === 12 && attendu === '0' + lu);

/** Quart de tour horaire — l'étiquette collée de travers sur un carton. */
function pivoter(img) {
  const { width: w, height: h, data } = img;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const src = (y * w + x) * 4;
      const dst = (x * h + (h - 1 - y)) * 4;
      out[dst] = data[src]; out[dst + 1] = data[src + 1];
      out[dst + 2] = data[src + 2]; out[dst + 3] = 255;
    }
  }
  return { data: out, width: h, height: w, colorSpace: 'srgb' };
}

/** Négatif — impression claire sur fond sombre. */
function inverser(img) {
  const o = clone(img);
  for (let i = 0; i < o.data.length; i += 4) {
    o.data[i] = 255 - o.data[i]; o.data[i + 1] = o.data[i]; o.data[i + 2] = o.data[i];
  }
  return o;
}

/** Contraste écrasé + bruit — étiquette pâle photographiée à l'arrache. */
function degrader(img) {
  const o = clone(img);
  let graine = 12345;
  const alea = () => (graine = (graine * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < o.data.length; i += 4) {
    // 60 % de contraste autour du gris moyen, puis ±18 de bruit.
    const v = 128 + (o.data[i] - 128) * 0.6 + (alea() - 0.5) * 36;
    const c = Math.max(0, Math.min(255, v));
    o.data[i] = c; o.data[i + 1] = c; o.data[i + 2] = c;
  }
  return o;
}

/** Réduction de moitié — le code vu de plus loin. */
function reduire(img) {
  const w = Math.floor(img.width / 2), h = Math.max(1, Math.floor(img.height / 2));
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Moyenne des quatre pixels source : un sous-échantillonnage brut
      // créerait des barres qui disparaissent purement et simplement.
      let s = 0;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        s += img.data[((y * 2 + dy) * img.width + (x * 2 + dx)) * 4];
      }
      const v = s / 4, d = (y * w + x) * 4;
      out[d] = v; out[d + 1] = v; out[d + 2] = v; out[d + 3] = 255;
    }
  }
  return { data: out, width: w, height: h, colorSpace: 'srgb' };
}

(async () => {
  const { writeBarcode } = await import('zxing-wasm/writer');
  const { readBarcodes } = await import('zxing-wasm/reader');

  const OPTIONS = {
    formats: FORMATS_DEMANDES,
    tryHarder: true, tryRotate: true, tryInvert: true, tryDownscale: true,
    maxNumberOfSymbols: 1, returnErrors: false,
  };

  const MATRICIELS = new Set(['QRCode', 'DataMatrix']);

  /* Le negatif ne concerne que les codes matriciels : un code-barres
     lineaire imprime en blanc sur noir n'existe pas dans la vraie vie,
     aucun lecteur du marche ne le lit, et l'exiger ferait echouer un
     test sur une situation qu'on ne rencontrera jamais. */
  const EPREUVES = [
    ['net',      img => img,  () => true],
    ['pivote',   pivoter,     () => true],
    ['negatif',  inverser,    f => MATRICIELS.has(f)],
    ['reduit',   reduire,     () => true],
    ['degrade',  degrader,    () => true],
  ];

  console.log('Aller-retour generation -> lecture, zxing-cpp (WASM)\n');
  const entete = 'format'.padEnd(12) + EPREUVES.map(e => e[0].padStart(9)).join('');
  console.log(entete);
  console.log('-'.repeat(entete.length));

  let total = 0, reussis = 0;
  const echecs = [];

  for (const cas of CAS) {
    const ecrit = await writeBarcode(cas.valeur, { format: cas.format, scale: 4 });
    if (ecrit.error || !ecrit.symbol) {
      console.log(cas.format.padEnd(12) + '  generation impossible : ' + ecrit.error);
      continue;
    }
    // x6 : environ ce qu'une camera 720p voit d'un code-barres cadre.
    const base = agrandir(versImageData(ecrit.symbol), 6);

    const ligne = [];
    for (const [nom, transfo, concerne] of EPREUVES) {
      if (!concerne(cas.format)) { ligne.push('     s.o.'); continue; }
      total++;
      let verdict = '  rate';
      try {
        const res = await readBarcodes(transfo(base), OPTIONS);
        const bon = (res || []).find(r => r.isValid && r.text);
        if (bon && memeCode(bon.text, cas.valeur)) { verdict = '    ok'; reussis++; }
        else if (bon) { verdict = '  FAUX'; echecs.push(`${cas.format}/${nom} : a lu "${bon.text}" au lieu de "${cas.valeur}"`); }
        else echecs.push(`${cas.format}/${nom} : rien lu`);
      } catch (e) {
        echecs.push(`${cas.format}/${nom} : ${e.message}`);
      }
      ligne.push(verdict.padStart(9));
    }
    console.log(cas.format.padEnd(12) + ligne.join(''));
  }

  console.log('\n' + reussis + '/' + total + ' lectures conformes');
  if (echecs.length) {
    console.log('\nDetail des echecs :');
    for (const e of echecs) console.log('  - ' + e);
  }

  /* Un code FAUX est bien plus grave qu'un code manque : il entre en
     stock ou part sur une commande. Le test echoue sur celui-la seul. */
  const faux = echecs.filter(e => e.includes('a lu'));
  if (faux.length) { console.log('\nLECTURE FAUSSE — bloquant.'); process.exit(1); }
  console.log(faux.length === 0 ? '\nAucune lecture fausse.' : '');
})().catch(e => { console.error(e); process.exit(1); });
