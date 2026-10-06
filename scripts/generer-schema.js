#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════
   GÉNÉRATION DU SCHÉMA CONSOLIDÉ — install/schema.sql

   Une instance neuve naît de ce fichier. Il doit donc être la copie
   EXACTE de la structure de la production : tables, vues, fonctions,
   déclencheurs, règles RLS, index, contraintes, droits.

   Version précédente (23/08/2026) : reconstitution par introspection
   PostgREST + greffes de migrations. Elle ratait ce que PostgREST ne
   montre pas — mesuré le 06/10/2026 : 32 règles RLS sur 47, 4
   déclencheurs sur 9, 2 fonctions sur 4. Une boutique neuve serait née
   avec des protections et des automatismes en moins.

   Cette version lit la base directement avec pg_dump (accès Postgres
   direct, qui fonctionne même quand l'API Supabase est restreinte).

   Usage :
     node scripts/generer-schema.js --source-env NEW_DATABASE_URL \
       [--pg-dump "C:/…/pgsql/bin/pg_dump.exe"]

   · --source-env : nom de la variable de .env.local qui contient la
     chaîne de connexion de la base de RÉFÉRENCE (jamais affichée) ;
   · --pg-dump    : chemin de pg_dump 17+ (défaut : env PG_DUMP, puis
     « pg_dump » dans le PATH).

   Le fichier produit n'est PAS rejouable : il refuse de s'exécuter sur
   une base qui contient déjà une boutique (garde-fou en tête). On ne
   l'applique que sur un projet Supabase NEUF, puis install/seed.sql,
   puis scripts/installer.js.
   ═══════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { createHash } = require('crypto');

const arg = (nom, defaut = '') => {
  const i = process.argv.indexOf('--' + nom);
  return i > -1 ? String(process.argv[i + 1] || '') : defaut;
};

const RACINE = path.join(__dirname, '..');
const SORTIE = path.join(RACINE, 'install', 'schema.sql');
const cle = arg('source-env');
if (!cle) {
  console.error('--source-env <VARIABLE> requis (ex. NEW_DATABASE_URL) : la base de référence est toujours explicite.');
  process.exit(1);
}

/* ── Connexion : lue dans .env.local, jamais affichée ─────────── */
const env = fs.readFileSync(path.join(RACINE, '.env.local'), 'utf8');
const brut = ((env.match(new RegExp('^' + cle + '=(.*)$', 'm')) || [])[1] || '').trim().replace(/^["']|["']$/g, '');
/* Découpage manuel : un mot de passe peut contenir @ : / ? que
   l'analyse d'URL standard prend pour des séparateurs. */
const m = brut.match(/^postgres(?:ql)?:\/\/([^:]+):(.*)@([^@:\/]+):(\d+)\/([^?\s]+)/);
if (!m) { console.error(`${cle} absente de .env.local ou mal formée.`); process.exit(1); }
let motDePasse = m[2];
try { motDePasse = decodeURIComponent(motDePasse); } catch { /* déjà en clair */ }

const pgDump = arg('pg-dump') || process.env.PG_DUMP || 'pg_dump';
const r = spawnSync(pgDump,
  ['--schema-only', '--schema=public', '--no-owner', '--no-comments'],
  {
    encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, PGHOST: m[3], PGPORT: m[4], PGUSER: m[1], PGPASSWORD: motDePasse, PGDATABASE: m[5], PGSSLMODE: 'require' },
  });
if (r.status !== 0) {
  console.error('pg_dump a échoué :', (r.stderr || r.error?.message || '').slice(0, 500));
  process.exit(1);
}

/* ── Nettoyage : ce qu'un projet Supabase neuf possède déjà, ou
      qu'il refuse (droits par défaut des rôles internes). ─────────── */
let sql = r.stdout.replace(/\r/g, '')
  .split('\n')
  .filter(l => !/^CREATE SCHEMA public;/.test(l))
  .filter(l => !/^ALTER DEFAULT PRIVILEGES/.test(l))
  .filter(l => !/^\\(restrict|unrestrict)\b/.test(l))   // méta-commandes psql (pg_dump ≥ 17.6)
  .join('\n');

const compte = re => (sql.match(re) || []).length;
const stats = {
  tables: compte(/^CREATE TABLE /gm),
  vues: compte(/^CREATE (OR REPLACE )?VIEW /gm),
  fonctions: compte(/^CREATE (OR REPLACE )?FUNCTION /gm),
  declencheurs: compte(/^CREATE (OR REPLACE )?TRIGGER /gm),
  rls: compte(/^CREATE POLICY /gm),
  index: compte(/^CREATE (UNIQUE )?INDEX /gm),
};
const empreinte = createHash('sha256').update(sql, 'utf8').digest('hex').slice(0, 12);
const date = new Date().toISOString().slice(0, 16).replace('T', ' ');

const entete = `-- SCHEMA ${empreinte} — généré le ${date}
-- ═══════════════════════════════════════════════════════════════
--  SCHÉMA CONSOLIDÉ — instance neuve
--
--  GÉNÉRÉ par scripts/generer-schema.js (pg_dump de la base de
--  référence). NE PAS ÉDITER À LA MAIN : relancer le générateur.
--
--  ${stats.tables} tables · ${stats.vues} vue(s) · ${stats.fonctions} fonctions · ${stats.declencheurs} déclencheurs · ${stats.rls} règles RLS · ${stats.index} index
--
--  Usage : sur un projet Supabase NEUF uniquement — SQL Editor (ou
--  Management API), puis install/seed.sql, puis scripts/installer.js.
-- ═══════════════════════════════════════════════════════════════

-- ─── Garde-fou : jamais sur une base qui contient déjà une boutique ───
DO $garde$
BEGIN
  IF to_regclass('public.products') IS NOT NULL THEN
    RAISE EXCEPTION 'Base non vierge : public.products existe déjà. Ce schéma ne s''applique que sur un projet Supabase NEUF.';
  END IF;
END
$garde$;

-- ─── Extensions (présentes par défaut sur Supabase ; sans effet sinon) ───
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

`;

fs.writeFileSync(SORTIE, entete + sql.trim() + '\n');
console.log(`install/schema.sql régénéré — empreinte ${empreinte}`);
console.log(stats);
