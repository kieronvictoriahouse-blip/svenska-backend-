#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════
   RESTAURATION D'UNE SAUVEGARDE QUOTIDIENNE

   Les sauvegardes sont écrites chaque nuit par /api/cron/sauvegarde
   dans le bucket privé `sauvegardes` (AAAA-MM-JJ.json.gz, 14 jours).

   1) Télécharger une sauvegarde sur ce poste (à faire de temps en
      temps : une copie hors du projet protège aussi de sa perte) :
        node scripts/restaurer-sauvegarde.js --telecharger 2026-10-07 \
          --source-url-env NEXT_PUBLIC_SUPABASE_URL --source-cle-env SUPABASE_SERVICE_ROLE_KEY

   2) Restaurer dans une base (accès Postgres direct, cible EXPLICITE) :
        node scripts/restaurer-sauvegarde.js --fichier 2026-10-07.json.gz \
          --cible-env NEW_DATABASE_URL [--tables orders,invoices] [--remplacer --confirmer]

      · par défaut : FUSION — n'ajoute que les lignes absentes
        (ON CONFLICT DO NOTHING), rien n'est écrasé ni supprimé ;
      · --remplacer --confirmer : vide les tables visées puis les
        recharge entièrement (les deux options sont exigées exprès).
      · Les déclencheurs et contrôles de clés étrangères sont suspendus
        le temps de la restauration (session_replication_role = replica),
        pour que l'ordre des tables n'importe pas et qu'aucun automatisme
        (stock, emails…) ne se relance.
      · Les comptes (auth.users) ne sont PAS restaurés : la sauvegarde
        n'a pas les mots de passe. Ils servent d'inventaire.

   Prérequis : le paquet `pg` (npm i -D pg, ou NODE_PATH vers un dossier
   qui le contient).
   ═══════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');
const { gunzipSync } = require('zlib');

const arg = (nom, defaut = '') => {
  const i = process.argv.indexOf('--' + nom);
  return i > -1 ? String(process.argv[i + 1] || '') : defaut;
};
const drapeau = nom => process.argv.includes('--' + nom);
const RACINE = path.join(__dirname, '..');
const env = fs.readFileSync(path.join(RACINE, '.env.local'), 'utf8');
const lireEnv = cle => ((env.match(new RegExp('^' + cle + '=(.*)$', 'm')) || [])[1] || '').trim().replace(/^["']|["']$/g, '');

async function telecharger(jour) {
  const url = lireEnv(arg('source-url-env', 'NEXT_PUBLIC_SUPABASE_URL'));
  const cle = lireEnv(arg('source-cle-env', 'SUPABASE_SERVICE_ROLE_KEY'));
  if (!url || !cle) throw new Error('URL ou clé source introuvable dans .env.local');
  const res = await fetch(`${url}/storage/v1/object/sauvegardes/${jour}.json.gz`, {
    headers: { apikey: cle, Authorization: `Bearer ${cle}` },
  });
  if (!res.ok) throw new Error(`Téléchargement ${res.status} : ${(await res.text()).slice(0, 200)}`);
  const sortie = path.join(RACINE, '..', '..', '_sauvegardes', `${jour}.json.gz`);
  fs.mkdirSync(path.dirname(sortie), { recursive: true });
  fs.writeFileSync(sortie, Buffer.from(await res.arrayBuffer()));
  console.log('Sauvegarde téléchargée :', sortie);
}

function connexion(cle) {
  const brut = lireEnv(cle);
  const m = brut.match(/^postgres(?:ql)?:\/\/([^:]+):(.*)@([^@:\/]+):(\d+)\/([^?\s]+)/);
  if (!m) throw new Error(`${cle} absente de .env.local ou mal formée`);
  let pw = m[2];
  try { pw = decodeURIComponent(pw); } catch { /* en clair */ }
  const local = /^(localhost|127\.0\.0\.1)$/.test(m[3]);
  return { user: m[1], password: pw, host: m[3], port: +m[4], database: m[5], ssl: local ? false : { rejectUnauthorized: false } };
}

async function restaurer() {
  const fichier = arg('fichier');
  const cible = arg('cible-env');
  if (!fichier || !cible) throw new Error('--fichier et --cible-env sont requis (la cible est toujours explicite).');
  const remplacer = drapeau('remplacer');
  if (remplacer && !drapeau('confirmer')) throw new Error('--remplacer vide les tables : ajouter --confirmer pour le vouloir vraiment.');

  const chemin = fs.existsSync(fichier) ? fichier : path.join(RACINE, '..', '..', '_sauvegardes', fichier);
  const svg = JSON.parse(gunzipSync(fs.readFileSync(chemin)).toString('utf8'));
  const filtre = arg('tables') ? new Set(arg('tables').split(',').map(s => s.trim())) : null;
  const tables = Object.keys(svg.tables).filter(t => !t.includes('.') && (!filtre || filtre.has(t)));
  console.log(`Sauvegarde du ${svg.cree_le} — ${tables.length} table(s) → ${cible} (${remplacer ? 'REMPLACEMENT' : 'fusion'})`);

  const { Client } = require('pg');
  const c = new Client(connexion(cible));
  await c.connect();
  await c.query('begin');
  try {
    await c.query('set local session_replication_role = replica');
    for (const t of tables) {
      const lignes = svg.tables[t] || [];
      const existe = (await c.query(`select to_regclass($1) r`, ['public.' + t])).rows[0].r;
      if (!existe) { console.log(`  ${t} : absente de la cible, ignorée`); continue; }
      if (remplacer) await c.query(`delete from public."${t}"`);
      /* Colonnes réellement inscriptibles : une colonne CALCULÉE (generated
         always as …) refuse toute valeur — inbox_messages.has_attachment
         l'a montré au premier test. Une identité « always » exige
         OVERRIDING SYSTEM VALUE pour garder ses numéros d'origine. */
      const cols = (await c.query(
        `select column_name, is_identity, identity_generation from information_schema.columns
          where table_schema = 'public' and table_name = $1 and is_generated = 'NEVER'
          order by ordinal_position`, [t])).rows;
      const liste = cols.map(x => `"${x.column_name}"`).join(', ');
      const forcer = cols.some(x => x.is_identity === 'YES' && x.identity_generation === 'ALWAYS') ? ' overriding system value' : '';
      let ajoutees = 0;
      for (let i = 0; i < lignes.length; i += 500) {
        const lot = lignes.slice(i, i + 500);
        /* json_populate_recordset convertit chaque champ dans le type de
           sa colonne (uuid, jsonb, tableaux, dates…) : pas de mapping à
           maintenir, et une colonne ajoutée depuis reste à NULL. */
        const r = await c.query(
          `insert into public."${t}" (${liste})${forcer} select ${liste} from json_populate_recordset(null::public."${t}", $1::json) on conflict do nothing`,
          [JSON.stringify(lot)]);
        ajoutees += r.rowCount;
      }
      console.log(`  ${t.padEnd(28)} ${String(lignes.length).padStart(5)} dans la sauvegarde · ${String(ajoutees).padStart(5)} écrite(s)`);
    }
    await c.query('commit');
    console.log('Restauration terminée.');
  } catch (e) {
    await c.query('rollback');
    throw e;
  } finally {
    await c.end();
  }
}

(async () => {
  if (arg('telecharger')) return telecharger(arg('telecharger'));
  return restaurer();
})().catch(e => { console.error('ÉCHEC :', e.message); process.exit(1); });
