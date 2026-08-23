/* ═══════════════════════════════════════════════════════════════
   RUNNER DE MIGRATIONS — par instance

   Chaque instance tient son registre (table schema_migrations, créée
   par install/schema.sql). Ce script compare le registre aux fichiers
   de supabase/migrations/ et dit ce qui manque.

   La clé de service ne sait PAS exécuter du DDL (PostgREST). Le SQL en
   attente est donc ÉMIS, prêt à coller dans le SQL Editor de
   l'instance — puis --marquer enregistre l'application. Le jour où le
   control plane a un accès direct (API Management), il remplacera le
   collage ; le registre, lui, ne change pas.

   Un checksum accompagne chaque enregistrement : une migration
   MODIFIÉE après application est signalée — on n'édite pas le passé,
   on écrit une migration de plus (même philosophie que le journal de
   stock et la chaîne des factures).

   node scripts/migrer.js --statut                        → état
   node scripts/migrer.js                                 → SQL en attente
   node scripts/migrer.js --marquer                       → enregistre tout comme appliqué
   Cible : .env.local par défaut, ou INSTANCE_URL / INSTANCE_KEY.
   ═══════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');

const envLocal = (() => {
  try { return fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').replace(/\r/g, ''); }
  catch { return ''; }
})();
const lire = k => process.env['INSTANCE_' + k.replace(/^.*_/, '')]
  || ((envLocal.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1] || '').trim().replace(/^["']|["']$/g, '');

const URL = process.env.INSTANCE_URL || lire('NEXT_PUBLIC_SUPABASE_URL');
const KEY = process.env.INSTANCE_KEY || lire('SUPABASE_SERVICE_ROLE_KEY');
if (!URL || !KEY) { console.error('Cible inconnue : INSTANCE_URL/INSTANCE_KEY ou .env.local'); process.exit(1); }

const entetes = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };
const sha = s => createHash('sha256').update(s.replace(/\r/g, ''), 'utf8').digest('hex').slice(0, 16);

const STATUT = process.argv.includes('--statut');
const MARQUER = process.argv.includes('--marquer');

(async () => {
  const dossier = path.join(__dirname, '..', 'supabase', 'migrations');
  const fichiers = fs.readdirSync(dossier).filter(f => f.endsWith('.sql')).sort();

  const r = await fetch(`${URL}/rest/v1/schema_migrations?select=fichier,checksum,applique_le`, { headers: entetes });
  if (r.status === 404) {
    console.error(`Le registre schema_migrations n'existe pas sur cette instance.
Coller d'abord dans son SQL Editor :

CREATE TABLE IF NOT EXISTS schema_migrations (
  fichier TEXT PRIMARY KEY,
  applique_le TIMESTAMPTZ DEFAULT now(),
  checksum TEXT
);
ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY;

Puis, si l'instance est DÉJÀ à jour (cas de la production historique) :
  node scripts/migrer.js --marquer`);
    process.exitCode = 1;
    return;
  }
  const appliquees = await r.json();
  const parFichier = Object.fromEntries((appliquees || []).map(m => [m.fichier, m]));

  const attente = [];
  const modifiees = [];
  for (const f of fichiers) {
    const contenu = fs.readFileSync(path.join(dossier, f), 'utf8');
    const c = sha(contenu);
    const enr = parFichier[f];
    if (!enr) { attente.push({ f, contenu, c }); continue; }
    if (enr.checksum && enr.checksum !== c) modifiees.push(f);
  }

  if (modifiees.length) {
    console.error('ATTENTION — migration(s) modifiée(s) APRÈS application :');
    for (const f of modifiees) console.error('  !', f);
    console.error('On n\'édite pas une migration appliquée : écrire une migration de plus.\n');
  }

  if (STATUT || (!attente.length && !MARQUER)) {
    console.log(`instance : ${URL}`);
    console.log(`appliquées : ${(appliquees || []).length} · en attente : ${attente.length}` +
      (modifiees.length ? ` · modifiées : ${modifiees.length}` : ''));
    for (const a of attente) console.log('  →', a.f);
    return;
  }

  if (MARQUER) {
    if (!attente.length) { console.log('Rien à marquer.'); return; }
    const corps = attente.map(a => ({ fichier: a.f, checksum: a.c }));
    const ins = await fetch(`${URL}/rest/v1/schema_migrations`, {
      method: 'POST', headers: { ...entetes, Prefer: 'resolution=ignore-duplicates' },
      body: JSON.stringify(corps),
    });
    if (!ins.ok) { console.error('échec :', await ins.text()); process.exit(1); }
    console.log(attente.length, 'migration(s) enregistrée(s) comme appliquées.');
    return;
  }

  /* Par défaut : émettre le SQL en attente, prêt à coller. */
  console.log(`-- ${attente.length} migration(s) en attente pour ${URL}`);
  console.log(`-- Coller ce qui suit dans le SQL Editor, puis :`);
  console.log(`--   node scripts/migrer.js --marquer\n`);
  for (const a of attente) {
    console.log(`-- ═══ ${a.f} ═══`);
    console.log(a.contenu.trim() + '\n');
  }
})().catch(e => { console.error(e); process.exit(1); });
