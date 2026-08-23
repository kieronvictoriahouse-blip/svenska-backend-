/* ═══════════════════════════════════════════════════════════════
   AUDIT DE MARQUE — le moteur ne doit porter aucune marque en dur

   Prérequis du SaaS (SAAS/02-DEBRANDING.md) : toute identité de
   marchand — nom, domaine, SIREN, ville, boîte mail — vit dans
   white_label_config ou dans les variables des gabarits, jamais dans
   le code. Ce script est le compteur : il doit tomber à zéro, puis y
   rester (code retour ≠ 0 sinon, pour la CI).

   Ce qui N'EST PAS de la marque, et n'est donc pas cherché :
   · les intégrations produit (Mondial Relay, Stripe, Logspher…) ;
   · les numéros de pièces (SD-0105…) cités dans les commentaires ;
   · les fournisseurs (GEKAS, WILLYS…) — données du client, en base.

   node scripts/audit-marque.js            → liste + compteur
   node scripts/audit-marque.js --fichiers → seulement les chemins
   ═══════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');

/* Les motifs de la marque Swedish Cravings. Ajouter ici toute nouvelle
   fuite constatée : le motif documente ce qu'on a laissé passer. */
const MOTIFS = [
  { nom: 'nom commercial', re: /swedish\s*cravings/gi },
  /* Sensible à la casse : « Den svenska delikatessen » est du suédois
     ordinaire — seule la forme TitreCase (ou le domaine) est la marque. */
  { nom: 'ancien nom', re: /Svenska Delikatessen|svenska-delikatessen/g },
  { nom: 'domaine', re: /swedishcravings\.(fr|com)/gi },
  { nom: 'boite mail', re: /hej@/gi },
  { nom: 'SIREN', re: /105[\s.]?003[\s.]?537/g },
  { nom: 'identite legale', re: /victoria\s+vallet/gi },
  { nom: 'ville atelier', re: /marcq[- ]en[- ]bar/gi },
];

const RACINES = ['src'];
const EXT = new Set(['.ts', '.tsx', '.html', '.css']);
/* Les scripts d'exploitation et la doc parlent LEGITIMEMENT de la
   boutique d'origine (corrections datées, contexte) : hors périmètre.
   Le périmètre, c'est ce qui est LIVRÉ à une instance. */
const EXCLUS = [/[\\/]scripts[\\/]/, /SAAS[\\/]/, /\.md$/];

const soloFichiers = process.argv.includes('--fichiers');

function* fichiers(dossier) {
  for (const e of fs.readdirSync(dossier, { withFileTypes: true })) {
    const p = path.join(dossier, e.name);
    if (e.isDirectory()) { yield* fichiers(p); continue; }
    if (!EXT.has(path.extname(e.name))) continue;
    if (EXCLUS.some(r => r.test(p))) continue;
    yield p;
  }
}

let total = 0;
const parFichier = new Map();

for (const racine of RACINES) {
  for (const f of fichiers(racine)) {
    const contenu = fs.readFileSync(f, 'utf8');
    const lignes = contenu.split(/\r?\n/);
    const trouves = [];
    lignes.forEach((l, i) => {
      for (const m of MOTIFS) {
        m.re.lastIndex = 0;
        if (m.re.test(l)) trouves.push({ ligne: i + 1, motif: m.nom, extrait: l.trim().slice(0, 90) });
      }
    });
    if (trouves.length) { parFichier.set(f, trouves); total += trouves.length; }
  }
}

console.log('===========================================================');
console.log('  AUDIT DE MARQUE -- ' + new Date().toISOString().slice(0, 10));
console.log('===========================================================\n');

if (!parFichier.size) {
  console.log('  Aucune marque en dur. Le moteur est neutre.\n');
  process.exit(0);
}

const tri = [...parFichier.entries()].sort((a, b) => b[1].length - a[1].length);
for (const [f, occ] of tri) {
  console.log(`  ${String(occ.length).padStart(3)}  ${f.replace(/\\/g, '/')}`);
  if (!soloFichiers) {
    for (const o of occ.slice(0, 4)) console.log(`         L${o.ligne} [${o.motif}] ${o.extrait}`);
    if (occ.length > 4) console.log(`         … et ${occ.length - 4} autres`);
  }
}

console.log(`\n  ${total} occurrence(s) dans ${parFichier.size} fichier(s).`);
console.log('===========================================================\n');
process.exit(1);
