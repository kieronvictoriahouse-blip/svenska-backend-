/* ═══════════════════════════════════════════════════════════════
   COPIE DES MOTEURS DE CODES-BARRES DANS /public

   zxing-wasm va chercher son binaire sur un CDN par défaut
   (fastly.jsdelivr.net). Pour un back-office qu'on ouvre sur un
   téléphone au fond d'une réserve, dépendre d'un tiers pour scanner un
   code-barres est une mauvaise idée : réseau capricieux, CDN bloqué par
   un pare-feu d'entreprise, ou simplement hors service. Le binaire est
   donc servi par notre propre domaine.

   Deux binaires : la lecture (scanner) et l'écriture (QR code de
   paiement de la caisse).

   Le fichier DOIT correspondre à la version du paquet installé : la
   glue JavaScript et le binaire sont compilés ensemble. On le recopie
   donc à chaque build plutôt que de le versionner à la main, où il
   dériverait au premier `npm update` sans que rien ne le signale.

   node scripts/copier-wasm.js
   ═══════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');

/* Lecture directe du manifeste : `require('zxing-wasm/package.json')`
   est refusé, le paquet ne l'expose pas dans son champ `exports`. */
const manifeste = path.join(__dirname, '..', 'node_modules', 'zxing-wasm', 'package.json');
const version = fs.existsSync(manifeste) ? JSON.parse(fs.readFileSync(manifeste, 'utf8')).version : '?';

for (const moteur of ['reader', 'writer']) {
  const source = path.join(__dirname, '..', 'node_modules', 'zxing-wasm', 'dist', moteur, `zxing_${moteur}.wasm`);
  const cible = path.join(__dirname, '..', 'public', `zxing_${moteur}.wasm`);

  if (!fs.existsSync(source)) {
    console.error('[wasm] introuvable :', source);
    console.error('[wasm] le paquet retombera sur le CDN. `npm install` puis relancer.');
    continue;                 // ne casse pas le build : le CDN reste un repli
  }

  fs.mkdirSync(path.dirname(cible), { recursive: true });
  fs.copyFileSync(source, cible);
  const ko = Math.round(fs.statSync(cible).size / 1024);
  console.log(`[wasm] zxing-wasm ${version} (${moteur}) copié dans public/ (${ko} Ko)`);
}
