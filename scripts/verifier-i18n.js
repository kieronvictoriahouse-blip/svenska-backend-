/* ═══════════════════════════════════════════════════════════════
   VÉRIFICATION DES DICTIONNAIRES

   L'audit dit ce qui reste à traduire ; celui-ci dit si ce qui est
   traduit l'est vraiment dans les trois langues. Une entrée sans `sv`
   se replie sur le français sans rien signaler : l'interface a l'air
   traduite, et un mot français apparaît au milieu du suédois.

   node scripts/verifier-i18n.js
   ═══════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');

function fichiers(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...fichiers(p));
    else if (/i18n.*\.ts$/.test(e.name)) out.push(p);
  }
  return out;
}

const cibles = [...fichiers(path.join(__dirname, '..', 'src', 'app', 'admin')),
  path.join(__dirname, '..', 'src', 'lib', 'admin-i18n.ts'),
  path.join(__dirname, '..', 'src', 'lib', 'admin-nav.ts')];

/* Une entrée : `cle: { fr: '…', en: '…', sv: '…' }`, sur une ou
   plusieurs lignes. */
const ENTREE = /(\w+)\s*:\s*\{\s*fr\s*:\s*(['"`])(?:\\.|(?!\2).)*\2([^{}]*)\}/g;

let total = 0;
const trous = [];

for (const f of cibles) {
  const s = fs.readFileSync(f, 'utf8');
  const rel = path.relative(path.join(__dirname, '..'), f).replace(/\\/g, '/');
  for (const m of s.matchAll(ENTREE)) {
    total++;
    const reste = m[3];
    if (!/\ben\s*:/.test(reste)) trous.push(`${rel} → ${m[1]} (anglais)`);
    if (!/\bsv\s*:/.test(reste)) trous.push(`${rel} → ${m[1]} (suédois)`);
  }
}

console.log(`${total} entrées de dictionnaire · ${trous.length} traduction(s) manquante(s)`);
for (const t of trous) console.log('  ' + t);
process.exit(trous.length ? 1 : 0);
