/* ═══════════════════════════════════════════════════════════════
   GÉNÉRATION DU SCHÉMA CONSOLIDÉ — install/schema.sql

   Le schéma d'une instance neuve ne se rejoue PAS depuis les 46
   migrations : elles supposent une base qui a vécu (tables créées à la
   main avant d'être versionnées, reprises de données, corrections).
   Il se dérive de DEUX sources, chacune pour ce qu'elle sait :

   · l'introspection PostgREST de la base de PRODUCTION — la vérité des
     tables telles qu'elles existent aujourd'hui, dérive comprise :
     colonnes, types, défauts, clés primaires et étrangères ;

   · les migrations — ce que l'introspection ne voit pas : index,
     contraintes CHECK, RLS et politiques, fonctions, triggers, vues,
     commentaires. On les greffe dans l'ordre chronologique, en
     écartant ce qui est transitionnel (blocs DO de reprise, ADD COLUMN
     déjà portés par le CREATE).

   Relancer ce script après toute migration nouvelle : le schéma
   consolidé doit toujours décrire l'état courant.

   node scripts/generer-schema.js
   ═══════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');

const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').replace(/\r/g, '');
const lire = k => ((env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1] || '')
  .trim().replace(/^["']|["']$/g, '');

/* Les vues : présentes dans l'introspection comme des tables, mais leur
   CREATE vient des migrations. */
const VUES = new Set(['v_campaign_stats']);

/* ── Types PostgREST → SQL ─────────────────────────────────────── */
function typeSql(p) {
  let f = p.format || p.type || 'text';
  if (p.type === 'array') f = ((p.items && (p.items.format || p.items.type)) || 'text') + '[]';
  if (f === 'character varying') f = p.maxLength ? `varchar(${p.maxLength})` : 'text';
  return f;
}

function defautSql(d) {
  if (d === undefined || d === null) return null;
  if (typeof d === 'boolean' || typeof d === 'number') return String(d);
  const s = String(d);
  // fonctions, casts explicites et littéraux déjà quotés passent tels quels
  if (/\(\)|::|^'.*'$|^ARRAY\[|^\{/.test(s) || /^(now|gen_random_uuid|CURRENT_)/i.test(s)) return s;
  return `'${s.replace(/'/g, "''")}'`;
}

/* ── Découpe tolérante des migrations en instructions ──────────────
   Respecte les corps $$…$$ (fonctions) ; ignore les commentaires de
   début de ligne pour la détection, mais les conserve dans le texte. */
function* instructions(sql) {
  let i = 0, debut = 0, dansDollar = false;
  while (i < sql.length) {
    if (sql.startsWith('$$', i)) { dansDollar = !dansDollar; i += 2; continue; }
    if (!dansDollar && sql[i] === ';') {
      yield sql.slice(debut, i + 1).trim();
      debut = i + 1;
    }
    i++;
  }
  const reste = sql.slice(debut).trim();
  if (reste) yield reste + ';';
}

(async () => {
  /* ── 1. Les tables, depuis la production ──────────────────────── */
  const r = await fetch(lire('NEXT_PUBLIC_SUPABASE_URL') + '/rest/v1/', {
    headers: {
      apikey: lire('SUPABASE_SERVICE_ROLE_KEY'),
      Authorization: 'Bearer ' + lire('SUPABASE_SERVICE_ROLE_KEY'),
    },
  });
  const swagger = await r.json();
  const defs = swagger.definitions || {};
  const tables = Object.keys(defs).filter(t => !VUES.has(t)).sort();

  const creates = [];
  const fks = [];
  for (const t of tables) {
    const d = defs[t];
    const requis = new Set(d.required || []);
    const cols = [];
    let pk = null;
    for (const [c, p] of Object.entries(d.properties || {})) {
      const desc = String(p.description || '');
      const estPk = desc.includes('<pk/>');
      if (estPk) pk = c;
      const fk = desc.match(/<fk table='([^']+)' column='([^']+)'\/>/);
      if (fk) {
        fks.push(`ALTER TABLE ${t} ADD CONSTRAINT ${t}_${c}_fkey FOREIGN KEY (${c}) REFERENCES ${fk[1]} (${fk[2]}) ON DELETE ${c === 'product_id' && t === 'stock_movements' ? 'CASCADE' : 'SET NULL'};`);
      }
      const morceaux = [`  ${c}`, typeSql(p)];
      const def = defautSql(p.default);
      if (def !== null) morceaux.push('DEFAULT ' + def);
      if (requis.has(c) && !estPk) morceaux.push('NOT NULL');
      cols.push(morceaux.join(' '));
    }
    if (pk) cols.push(`  PRIMARY KEY (${pk})`);
    creates.push(`CREATE TABLE IF NOT EXISTS ${t} (\n${cols.join(',\n')}\n);`);
  }

  /* ── 2. Les greffes, depuis les migrations ────────────────────── */
  const dossier = path.join(__dirname, '..', 'supabase', 'migrations');
  const fichiers = fs.readdirSync(dossier).filter(f => f.endsWith('.sql')).sort();
  const GARDE = /^(CREATE (UNIQUE )?INDEX|CREATE POLICY|DROP POLICY|CREATE OR REPLACE VIEW|CREATE VIEW|CREATE TRIGGER|DROP TRIGGER|CREATE OR REPLACE FUNCTION|CREATE FUNCTION|DROP FUNCTION|COMMENT ON|ALTER TABLE [\w"]+ ENABLE ROW LEVEL SECURITY|ALTER TABLE [\w"]+ (DROP CONSTRAINT|ADD\s+CONSTRAINT))/i;
  const greffes = [];
  const vues = new Set();
  for (const f of fichiers) {
    const sql = fs.readFileSync(path.join(dossier, f), 'utf8').replace(/\r/g, '');
    for (const inst of instructions(sql)) {
      // la première ligne non commentaire décide
      const tete = inst.split('\n').map(l => l.trim()).find(l => l && !l.startsWith('--')) || '';
      if (!GARDE.test(tete)) continue;
      /* decrement_stock : créée en 018/031, supprimée en 044. On ne
         greffe ni sa création ni son DROP — elle n'existe plus. */
      if (/decrement_stock/i.test(inst)) continue;
      if (/^CREATE (OR REPLACE )?VIEW/i.test(tete)) {
        const nom = tete.match(/VIEW\s+([\w"]+)/i)?.[1];
        if (nom && vues.has(nom)) continue;   // première définition = celle de la vue vivante ? non : la DERNIÈRE
        if (nom) vues.add(nom);
      }
      greffes.push(`-- ${f}\n${inst}`);
    }
  }

  /* ── 3. Assemblage ────────────────────────────────────────────── */
  const entete = `-- ═══════════════════════════════════════════════════════════════
--  SCHÉMA CONSOLIDÉ — instance neuve
--
--  GÉNÉRÉ par scripts/generer-schema.js le ${new Date().toISOString().slice(0, 10)}
--  depuis l'introspection de la base de production (tables, colonnes,
--  clés) et les migrations (index, contraintes, RLS, fonctions, vues).
--  NE PAS ÉDITER À LA MAIN : relancer le générateur.
--
--  Usage : coller dans le SQL Editor d'un projet Supabase VIERGE,
--  puis install/seed.sql, puis node scripts/installer.js.
--  Idempotent : rejouable sans dommage.
-- ═══════════════════════════════════════════════════════════════

`;
  const piedFks = fks.length
    ? `\n-- ─── Clés étrangères (après création de toutes les tables) ───\n`
      + fks.map(x => x.replace('ADD CONSTRAINT', 'ADD CONSTRAINT IF NOT EXISTS')
        .replace(/^ALTER TABLE (\S+) ADD CONSTRAINT IF NOT EXISTS (\S+)/,
          (m, t, c) => `DO $x$ BEGIN\n  ALTER TABLE ${t} ADD CONSTRAINT ${c}`))
        .map(x => x.endsWith(';') ? x.slice(0, -1) + `;\nEXCEPTION WHEN duplicate_object THEN NULL; END $x$;` : x)
        .join('\n')
    : '';

  const sortie = entete
    + `-- ─── Extension requise ───\nCREATE EXTENSION IF NOT EXISTS pgcrypto;\n\n`
    + `-- ─── Tables (${tables.length}) — état réel de la production ───\n\n`
    + creates.join('\n\n') + '\n'
    + piedFks + '\n\n'
    + `-- ─── Index, contraintes, RLS, fonctions, triggers, vues ───\n`
    + `-- Greffés depuis les migrations, dans l'ordre chronologique.\n\n`
    + greffes.join('\n\n') + '\n\n'
    + `-- ─── Registre des migrations : une instance neuve naît à jour ───\n`
    + `CREATE TABLE IF NOT EXISTS schema_migrations (\n`
    + `  fichier TEXT PRIMARY KEY,\n  applique_le TIMESTAMPTZ DEFAULT now(),\n  checksum TEXT\n);\n`
    + `ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY;\n`;

  fs.mkdirSync(path.join(__dirname, '..', 'install'), { recursive: true });
  const cible = path.join(__dirname, '..', 'install', 'schema.sql');
  fs.writeFileSync(cible, sortie);
  console.log('install/schema.sql :', tables.length, 'tables,', fks.length, 'FK,', greffes.length, 'greffes,',
    Math.round(sortie.length / 1024), 'Ko');
})().catch(e => { console.error(e); process.exit(1); });
