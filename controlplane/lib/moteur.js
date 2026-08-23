/* ═══════════════════════════════════════════════════════════════
   MOTEUR — ce que le control plane lit dans le dépôt du moteur

   Le control plane vit DANS le dépôt (controlplane/) : schema.sql,
   seed.sql et les migrations se lisent en relatif, toujours à la
   version du commit déployé. Aucune synchronisation entre dépôts,
   aucune copie qui dérive.

   Les fonctions d'instance (bucket, admin, config, registre) sont la
   reprise de scripts/installer.js sous forme appelable — l'installateur
   CLI reste l'outil humain, ceci est l'outil du robot.
   ═══════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');
const { createHash, randomBytes } = require('crypto');
const { appeler } = require('./transport');

const RACINE = path.join(__dirname, '..', '..');

const lireSchema = () => fs.readFileSync(path.join(RACINE, 'install', 'schema.sql'), 'utf8');
const lireSeed = () => fs.readFileSync(path.join(RACINE, 'install', 'seed.sql'), 'utf8');

function listeMigrations() {
  const dossier = path.join(RACINE, 'supabase', 'migrations');
  return fs.readdirSync(dossier).filter(f => f.endsWith('.sql')).sort().map(f => ({
    fichier: f,
    checksum: createHash('sha256')
      .update(fs.readFileSync(path.join(dossier, f), 'utf8').replace(/\r/g, ''), 'utf8')
      .digest('hex').slice(0, 16),
  }));
}

const genSecret = () => randomBytes(24).toString('base64url');

/* ── Gestes sur une instance (via son URL + service key) ─────────── */

async function creerBucket(instance, nom) {
  const r = await appeler('POST', `${instance.url}/storage/v1/bucket`, {
    headers: { apikey: instance.serviceKey, Authorization: 'Bearer ' + instance.serviceKey },
    corps: { id: nom, name: nom, public: true },
  });
  if (r.ok) return true;
  const txt = await r.text();
  if (/already exists|duplicate/i.test(txt)) return true;
  throw new Error('bucket : ' + txt);
}

async function creerAdmin(instance, email) {
  const motDePasse = randomBytes(12).toString('base64url');
  const r = await appeler('POST', `${instance.url}/auth/v1/admin/users`, {
    headers: { apikey: instance.serviceKey, Authorization: 'Bearer ' + instance.serviceKey },
    corps: { email, password: motDePasse, email_confirm: true },
  });
  if (r.ok) return { email, motDePasse };
  const txt = await r.text();
  if (/already.*(registered|exists)/i.test(txt)) return { email, motDePasse: null };
  throw new Error('admin : ' + txt);
}

async function ecrireIdentite(instance, identite) {
  const H = { apikey: instance.serviceKey, Authorization: 'Bearer ' + instance.serviceKey };
  const lignes = await appeler('GET', `${instance.url}/rest/v1/white_label_config?select=id&limit=1`, { headers: H })
    .then(r => r.json());
  if (!Array.isArray(lignes) || !lignes.length) throw new Error('config absente — le seed a-t-il tourné ?');
  const r = await appeler('PATCH', `${instance.url}/rest/v1/white_label_config?id=eq.${lignes[0].id}`, {
    headers: H, corps: identite,
  });
  if (!r.ok) throw new Error('identité : ' + await r.text());
}

async function enregistrerMigrations(instance) {
  const r = await appeler('POST', `${instance.url}/rest/v1/schema_migrations`, {
    headers: {
      apikey: instance.serviceKey, Authorization: 'Bearer ' + instance.serviceKey,
      Prefer: 'resolution=ignore-duplicates',
    },
    corps: listeMigrations(),
  });
  if (!r.ok) throw new Error('registre : ' + await r.text());
}

/** Les env à poser sur le projet Vercel de l'instance. */
function variablesInstance({ url, anon, serviceKey, bucket, urlAdmin, urlBoutique }) {
  return {
    NEXT_PUBLIC_SUPABASE_URL: url,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anon,
    SUPABASE_SERVICE_ROLE_KEY: serviceKey,
    NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET: bucket,
    NEXT_PUBLIC_BACKEND_URL: urlAdmin,
    NEXT_PUBLIC_FRONT_URL: urlBoutique,
    ADMIN_JWT_SECRET: genSecret(),
    CUSTOMER_JWT_SECRET: genSecret(),
    REPLACEMENT_SECRET: genSecret(),
    CRON_SECRET: genSecret(),
    INTERNAL_SECRET: genSecret(),
    IMPORT_SECRET: genSecret(),
  };
}

module.exports = {
  lireSchema, lireSeed, listeMigrations, genSecret,
  creerBucket, creerAdmin, ecrireIdentite, enregistrerMigrations, variablesInstance,
};
