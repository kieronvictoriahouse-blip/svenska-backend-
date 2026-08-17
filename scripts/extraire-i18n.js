/* Extrait les textes français encore en dur, fichier par fichier.
   Sert à préparer la traduction : on voit tout ce qu'il reste avant
   d'écrire quoi que ce soit.

   node scripts/extraire-i18n.js [motif]      */

const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..', 'src', 'app', 'admin');
const motif = process.argv[2] || '';

const JSX = />[A-ZÀ-Ü][a-zà-ÿ][^<>{}]{3,}</g;
const ATTRS = /(placeholder|title|aria-label)="[A-ZÀ-Ü][^"]{4,}"/g;
const TOASTS = /(showToast|say|alert|confirm)\(\s*[`']([^`']*[A-ZÀ-Üa-zà-ÿ]{4,}[^`']*)[`']/g;
const IGNORE = /Content-Type|application\/json|SWEDISH|EAN|Stripe|Mondial|http|Shopflow/;

function fichiers(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...fichiers(p));
    else if (/\.tsx$/.test(e.name)) out.push(p);
  }
  return out;
}

for (const f of fichiers(RACINE)) {
  const rel = path.relative(RACINE, f).replace(/\\/g, '/');
  if (motif && !rel.includes(motif)) continue;
  const s = fs.readFileSync(f, 'utf8');
  const trouve = [
    ...(s.match(JSX) || []),
    ...(s.match(ATTRS) || []),
    ...(s.match(TOASTS) || []),
  ].filter(x => !IGNORE.test(x));
  const uniques = [...new Set(trouve)];
  if (!uniques.length) continue;
  console.log(`\n### ${rel}  (${uniques.length})`);
  for (const x of uniques) console.log('  ' + x.replace(/\s+/g, ' '));
}
