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

/* Les vues de la migration 002 sont du poids mort : AUCUNE n'est lue
   par le code, et leurs definitions referencent des colonnes que les
   tables remodelees a la main n'ont plus (mp.product_id). Elles ne se
   greffent pas — v_campaign_stats reste seulement exclue des CREATE
   TABLE, car l'introspection la presente comme une table. */
const VUES = new Set(['v_campaign_stats']);

/* ── Types PostgREST → SQL ──────────────────────────────────────────
   `format` porte le type SQL quand il existe ; sinon on retombe sur le
   type JSON, qu'il faut TRADUIRE — « string » n'est pas un type
   PostgreSQL, et un tableau l'exposait tel quel (tags string[]). */
const TYPE_JSON = { string: 'text', integer: 'integer', number: 'numeric', boolean: 'boolean', object: 'jsonb' };
function typeSql(p) {
  let f = p.format || TYPE_JSON[p.type] || 'text';
  if (p.type === 'array') {
    const item = p.items || {};
    let it = item.format || TYPE_JSON[item.type] || 'text';
    it = it.replace(/\[\]$/, '');            // format déjà « text[] » : ne pas doubler
    f = it + '[]';
  }
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
   Un `;` ne termine une instruction que HORS de tout contexte quoté :
   corps $$…$$, chaîne '…' (avec '' comme échappement), identifiant
   "…", et commentaire de ligne --. La première version coupait sur
   chaque point-virgule — y compris ceux d'un COMMENT ON … 'texte ;
   texte', ce qui tranchait la chaîne et inversait tous les guillemets
   du fichier en aval. */
function* instructions(sql) {
  let i = 0, debut = 0;
  let dansDollar = false, dansQuote = false, dansIdent = false, dansComm = false;
  while (i < sql.length) {
    const c = sql[i];
    if (dansComm) { if (c === '\n') dansComm = false; i++; continue; }
    if (dansQuote) {
      if (c === "'") {
        if (sql[i + 1] === "'") { i += 2; continue; }   // '' échappé
        dansQuote = false;
      }
      i++; continue;
    }
    if (dansIdent) { if (c === '"') dansIdent = false; i++; continue; }
    if (dansDollar) { if (sql.startsWith('$$', i)) { dansDollar = false; i += 2; continue; } i++; continue; }

    if (sql.startsWith('--', i)) { dansComm = true; i += 2; continue; }
    if (sql.startsWith('$$', i)) { dansDollar = true; i += 2; continue; }
    if (c === "'") { dansQuote = true; i++; continue; }
    if (c === '"') { dansIdent = true; i++; continue; }
    if (c === ';') { yield sql.slice(debut, i + 1).trim(); debut = i + 1; }
    i++;
  }
  const reste = sql.slice(debut).trim();
  if (reste) yield reste + ';';
}

/* ── Contrôle d'équilibre : le fichier émis doit se parcourir sans
   jamais finir dans une chaîne, un identifiant ou un corps $$. ────── */
function verifierEquilibre(sql) {
  let dansDollar = false, dansQuote = false, dansIdent = false, dansComm = false;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (dansComm) { if (c === '\n') dansComm = false; continue; }
    if (dansQuote) { if (c === "'") { if (sql[i + 1] === "'") { i++; continue; } dansQuote = false; } continue; }
    if (dansIdent) { if (c === '"') dansIdent = false; continue; }
    if (dansDollar) { if (sql.startsWith('$$', i)) { dansDollar = false; i++; } continue; }
    if (sql.startsWith('--', i)) { dansComm = true; i++; continue; }
    if (sql.startsWith('$$', i)) { dansDollar = true; i++; continue; }
    if (c === "'") dansQuote = true;
    else if (c === '"') dansIdent = true;
  }
  if (dansQuote || dansIdent || dansDollar) {
    throw new Error(`Fichier déséquilibré : quote=${dansQuote} ident=${dansIdent} dollar=${dansDollar}`);
  }
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
  const GARDE = /^(CREATE (UNIQUE )?INDEX|CREATE POLICY|DROP POLICY|CREATE TRIGGER|DROP TRIGGER|CREATE OR REPLACE FUNCTION|CREATE FUNCTION|DROP FUNCTION|COMMENT ON|ALTER TABLE [\w"]+ ENABLE ROW LEVEL SECURITY|ALTER TABLE [\w"]+ (DROP CONSTRAINT|ADD\s+CONSTRAINT))/i;
  const presentes = new Set(tables.map(t => t.toLowerCase()));
  const greffes = [];
  const ecartees = [];
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
      /* Une greffe qui vise une table DISPARUE de la production (créée
         par une vieille migration puis renommée ou supprimée à la main,
         comme « clients » devenue « contacts ») ferait échouer tout le
         fichier. L'introspection fait foi : table absente → greffe
         écartée, et on le dit.

         L'extraction des cibles est GRAMMATICALE, pas un balayage
         global : la première version attrapait le « on » des
         commentaires français (« on ne déduit jamais… ») et les alias
         de jointure, et écartait des greffes parfaitement saines —
         dont la contrainte des statuts de commande. On retire d'abord
         commentaires et chaînes, puis on lit la construction propre à
         chaque type d'instruction. */
      const nu = inst
        .replace(/--[^\n]*/g, ' ')
        .replace(/'(?:[^']|'')*'/g, "''");
      const cibles = [];
      let m2;
      if ((m2 = nu.match(/COMMENT ON (?:TABLE|COLUMN)\s+("?[\w]+"?)/i))) cibles.push(m2[1]);
      if ((m2 = nu.match(/CREATE (?:UNIQUE )?INDEX\s+(?:IF NOT EXISTS\s+)?"?[\w]+"?\s+ON\s+(?:ONLY\s+)?("?[\w]+"?)/i))) cibles.push(m2[1]);
      if ((m2 = nu.match(/(?:CREATE|DROP) POLICY\s+(?:IF EXISTS\s+)?"[^"]+"\s+ON\s+("?[\w]+"?)/i))) cibles.push(m2[1]);
      if ((m2 = nu.match(/(?:CREATE|DROP) TRIGGER\s+(?:IF EXISTS\s+)?"?[\w]+"?[\s\S]*?\bON\s+("?[\w]+"?)/i))) cibles.push(m2[1]);
      if ((m2 = nu.match(/ALTER TABLE\s+(?:ONLY\s+)?("?[\w]+"?)/i))) cibles.push(m2[1]);
      for (const mv of nu.matchAll(/\b(?:FROM|JOIN)\s+("?[a-z_][\w]*"?)/g)) cibles.push(mv[1]);
      const inconnues = [...new Set(cibles.map(n => n.replace(/"/g, '').toLowerCase()))]
        .filter(n => !presentes.has(n) && !VUES.has(n) && !vues.has(n) && n !== 'schema_migrations');
      if (inconnues.length) {
        ecartees.push({ f, tete: tete.slice(0, 60), tables: inconnues });
        continue;
      }

      /* Validation au niveau COLONNE, même raison que les tables : une
         migration jamais appliquée en production (la 039 posait un CHECK
         sur customer_profiles.lang — colonne qui n'y existe pas) ne doit
         pas ressusciter dans le schéma neuf. Pour les index et les CHECK,
         chaque identifiant du corps doit être une colonne réelle de la
         table visée. */
      const idx = nu.match(/CREATE (?:UNIQUE )?INDEX\s+(?:IF NOT EXISTS\s+)?"?[\w]+"?\s+ON\s+("?[\w]+"?)\s*\(([^)]*)\)(?:\s+WHERE\s+(.+))?/i);
      const chk = nu.match(/ALTER TABLE\s+("?[\w]+"?)\s+ADD\s+CONSTRAINT\s+"?[\w]+"?\s+CHECK\s*\(([\s\S]*)\)/i);
      const aValider = idx
        ? { table: idx[1], corps: idx[2] + ' ' + (idx[3] || '') }
        : chk ? { table: chk[1], corps: chk[2] } : null;
      if (aValider) {
        const table = aValider.table.replace(/"/g, '');
        const props = new Set(Object.keys(defs[table]?.properties || {}).map(x => x.toLowerCase()));
        const MOTS = new Set(['is', 'null', 'in', 'or', 'and', 'not', 'true', 'false', 'where',
          'asc', 'desc', 'nulls', 'first', 'last', 'coalesce', 'length', 'lower', 'upper', 'case',
          'when', 'then', 'else', 'end', 'between', 'like', 'exists']);
        const colsInconnues = [...new Set(
          (aValider.corps.match(/[a-z_][a-z0-9_]*/gi) || [])
            .map(x => x.toLowerCase())
            .filter(x => !MOTS.has(x) && !props.has(x)),
        )];
        if (colsInconnues.length) {
          ecartees.push({ f, tete: tete.slice(0, 60), tables: [`${table}.${colsInconnues.join('/.')}`] });
          continue;
        }
      }

      /* Rejouabilité : CREATE POLICY et CREATE TRIGGER n'ont pas de
         IF NOT EXISTS. Un DROP IF EXISTS systématique juste avant rend
         le fichier relançable — y compris après une exécution partielle
         interrompue par une erreur. */
      let prete = inst;
      const pol = inst.match(/^CREATE POLICY\s+("[^"]+"|\w+)\s+ON\s+([\w".]+)/im);
      if (pol) prete = `DROP POLICY IF EXISTS ${pol[1]} ON ${pol[2]};\n${inst}`;
      const trg = inst.match(/^CREATE TRIGGER\s+(\w+)[\s\S]*?\bON\s+([\w".]+)/im);
      if (trg) prete = `DROP TRIGGER IF EXISTS ${trg[1]} ON ${trg[2]};\n${inst}`;
      greffes.push(`-- ${f}\n${prete}`);
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
    + `-- ─── Extension requise ───\nCREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;\n\n`
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
  verifierEquilibre(sortie);
  /* Empreinte en PREMIERE ligne : deux collages ne peuvent plus se
     confondre — l'erreur SQL d'un vieux fichier se demasque en une
     ligne. */
  const empreinte = require('crypto').createHash('sha256').update(sortie).digest('hex').slice(0, 12);
  const final = '-- SCHEMA ' + empreinte + ' — genere le '
    + new Date().toISOString().slice(0, 16).replace('T', ' ') + '\n' + sortie;
  fs.writeFileSync(cible, final);
  console.log('install/schema.sql :', tables.length, 'tables,', fks.length, 'FK,', greffes.length, 'greffes,',
    Math.round(final.length / 1024), 'Ko — empreinte', empreinte);
  if (ecartees.length) {
    console.log('greffes ecartees (tables disparues de la production) :');
    for (const e of ecartees) console.log('  -', e.f, '|', e.tete, '| tables :', e.tables.join(', '));
  }
})().catch(e => { console.error(e); process.exit(1); });
