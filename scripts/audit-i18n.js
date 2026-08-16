/* ═══════════════════════════════════════════════════════════════
   AUDIT DE TRADUCTION DU BACK-OFFICE

   Compte, écran par écran, les textes français encore écrits en dur
   dans le JSX et dans les attributs visibles. Sert à savoir où l'on en
   est sans avoir à ouvrir trente pages une par une, et à empêcher une
   régression : un écran traduit qui repasse au-dessus de zéro a perdu
   des libellés.

   node scripts/audit-i18n.js
   ═══════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..', 'src', 'app', 'admin');

/* Un mot français visible : commence par une majuscule accentuée ou non,
   suivi de minuscules. On ignore ce qui n'est pas du texte d'interface. */
const JSX = />[A-ZÀ-Ü][a-zà-ÿ][^<>{}]{3,}</g;
const ATTRS = /(placeholder|title|aria-label)="[A-ZÀ-Ü][^"]{4,}"/g;
const TOASTS = /(showToast|say|alert)\(\s*'[^']*[A-ZÀ-Üa-zà-ÿ]{4,}[^']*'/g;

const IGNORE = /Content-Type|application\/json|SWEDISH|EAN|Stripe|Mondial|http/;

function fichiers(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...fichiers(p));
    else if (/\.tsx$/.test(e.name)) out.push(p);
  }
  return out;
}

const lignes = [];
for (const f of fichiers(RACINE)) {
  const s = fs.readFileSync(f, 'utf8');
  const trouve = [
    ...(s.match(JSX) || []),
    ...(s.match(ATTRS) || []),
    ...(s.match(TOASTS) || []),
  ].filter(x => !IGNORE.test(x));
  const uniques = new Set(trouve);
  lignes.push({
    ecran: path.relative(RACINE, f).replace(/\\/g, '/'),
    restant: uniques.size,
    traduit: /useT\(|traduire\(|T_COMMON/.test(s),
  });
}

lignes.sort((a, b) => b.restant - a.restant);

const fait = lignes.filter(l => l.restant === 0);
const total = lignes.reduce((s, l) => s + l.restant, 0);

console.log(`${lignes.length} fichiers · ${fait.length} sans texte français en dur · ${total} libellés restants\n`);
for (const l of lignes) {
  if (l.restant === 0) continue;
  console.log(
    String(l.restant).padStart(4),
    l.traduit ? '~' : ' ',
    l.ecran,
  );
}
console.log('\n(~ = écran déjà branché sur la traduction, mais incomplet)');
