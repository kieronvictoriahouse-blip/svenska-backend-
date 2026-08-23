/* ═══════════════════════════════════════════════════════════════
   INSTALLATEUR — une boutique neuve sur un projet Supabase vierge

   Prérequis (une fois, dans le SQL Editor du projet NEUF) :
     1. coller install/schema.sql
     2. coller install/seed.sql

   Puis :
     INSTANCE_URL=https://xxx.supabase.co \
     INSTANCE_KEY=<service_role du projet neuf> \
     node scripts/installer.js --nom "Fromagerie Dupont" \
       --email contact@fromagerie.fr --siret 12345678900012 \
       --legal "EI Jean Dupont" --admin admin@fromagerie.fr

   Ce qu'il fait — tout est idempotent, relançable après un échec :
     · vérifie que le schéma est bien en place (sinon il s'arrête là) ;
     · crée le bucket de médias ;
     · crée le compte admin (Supabase Auth) et imprime le mot de passe
       UNE fois ;
     · écrit l'identité du marchand dans white_label_config ;
     · enregistre toutes les migrations comme appliquées (l'instance
       naît à jour — le schéma consolidé les contient) ;
     · imprime la liste des variables d'environnement à poser sur
       Vercel (cf. install/ENV.md).
   ═══════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');
const { randomBytes, createHash } = require('crypto');

const URL = process.env.INSTANCE_URL;
const KEY = process.env.INSTANCE_KEY;
if (!URL || !KEY) {
  console.error('INSTANCE_URL et INSTANCE_KEY (service_role du projet NEUF) sont requis.');
  console.error('On ne vise jamais implicitement .env.local : installer par-dessus la production');
  console.error('serait la pire erreur possible, donc la cible est toujours explicite.');
  process.exit(1);
}

const arg = (nom, defaut = '') => {
  const i = process.argv.indexOf('--' + nom);
  return i > -1 ? String(process.argv[i + 1] || '') : defaut;
};
const entetes = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };
const sha = s => createHash('sha256').update(s.replace(/\r/g, ''), 'utf8').digest('hex').slice(0, 16);

const NOM = arg('nom');
const EMAIL = arg('email');
const ADMIN = arg('admin') || EMAIL;
const BUCKET = arg('bucket', 'media');

(async () => {
  console.log('═══ INSTALLATION —', URL, '═══\n');

  /* ── 1. Le schéma est-il là ? ─────────────────────────────────── */
  const attendues = ['products', 'orders', 'invoices', 'white_label_config', 'stock_movements', 'schema_migrations'];
  const sw = await fetch(`${URL}/rest/v1/`, { headers: entetes }).then(r => r.json());
  const presentes = new Set(Object.keys(sw.definitions || {}));
  const manquantes = attendues.filter(t => !presentes.has(t));
  if (manquantes.length) {
    console.error('Schéma incomplet — tables absentes :', manquantes.join(', '));
    console.error('Coller install/schema.sql puis install/seed.sql dans le SQL Editor, puis relancer.');
    process.exit(1);
  }
  console.log('[ok] schéma en place —', presentes.size, 'tables');

  /* ── 2. Le seed est-il passé ? ────────────────────────────────── */
  const cfgR = await fetch(`${URL}/rest/v1/white_label_config?select=id&limit=1`, { headers: entetes });
  const cfgLignes = await cfgR.json();
  if (!Array.isArray(cfgLignes) || !cfgLignes.length) {
    console.error('white_label_config est vide — coller install/seed.sql, puis relancer.');
    process.exit(1);
  }
  console.log('[ok] configuration présente');

  /* ── 3. Bucket de médias ──────────────────────────────────────── */
  const b = await fetch(`${URL}/storage/v1/bucket`, {
    method: 'POST', headers: entetes,
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }),
  });
  if (b.ok) console.log(`[ok] bucket « ${BUCKET} » créé (public)`);
  else {
    const txt = await b.text();
    if (/already exists|duplicate/i.test(txt)) console.log(`[ok] bucket « ${BUCKET} » déjà là`);
    else { console.error('bucket :', txt); process.exit(1); }
  }

  /* ── 4. Compte admin ──────────────────────────────────────────── */
  let motDePasse = null;
  if (ADMIN) {
    motDePasse = randomBytes(12).toString('base64url');
    const u = await fetch(`${URL}/auth/v1/admin/users`, {
      method: 'POST', headers: entetes,
      body: JSON.stringify({ email: ADMIN, password: motDePasse, email_confirm: true }),
    });
    if (u.ok) console.log(`[ok] admin créé : ${ADMIN}`);
    else {
      const txt = await u.text();
      if (/already.*(registered|exists)/i.test(txt)) { console.log(`[ok] admin déjà là : ${ADMIN}`); motDePasse = null; }
      else { console.error('admin :', txt); process.exit(1); }
    }
  }

  /* ── 5. Identité du marchand ──────────────────────────────────── */
  const identite = {};
  for (const [flag, col] of [
    ['nom', 'site_name'], ['slogan', 'site_slogan'], ['email', 'email'],
    ['siret', 'siret'], ['legal', 'legal_name'], ['rcs', 'rcs_city'],
    ['ville', 'shop_city'], ['adresse', 'address'], ['url', 'front_url'],
  ]) { const v = arg(flag); if (v) identite[col] = v; }
  if (Object.keys(identite).length) {
    const m = await fetch(`${URL}/rest/v1/white_label_config?id=eq.${cfgLignes[0].id}`, {
      method: 'PATCH', headers: entetes, body: JSON.stringify(identite),
    });
    if (!m.ok) { console.error('identité :', await m.text()); process.exit(1); }
    console.log('[ok] identité écrite :', Object.keys(identite).join(', '));
  } else {
    console.log('[..] identité non fournie — à saisir dans Réglages avant la première facture');
  }

  /* ── 6. L'instance naît à jour ────────────────────────────────── */
  const dossier = path.join(__dirname, '..', 'supabase', 'migrations');
  const fichiers = fs.readdirSync(dossier).filter(f => f.endsWith('.sql')).sort();
  const corps = fichiers.map(f => ({
    fichier: f, checksum: sha(fs.readFileSync(path.join(dossier, f), 'utf8')),
  }));
  const ins = await fetch(`${URL}/rest/v1/schema_migrations`, {
    method: 'POST', headers: { ...entetes, Prefer: 'resolution=ignore-duplicates' },
    body: JSON.stringify(corps),
  });
  if (!ins.ok) { console.error('registre :', await ins.text()); process.exit(1); }
  console.log(`[ok] registre : ${fichiers.length} migrations marquées appliquées`);

  /* ── 7. La feuille de route Vercel ────────────────────────────── */
  console.log('\n═══ VARIABLES D\'ENVIRONNEMENT À POSER (cf. install/ENV.md) ═══\n');
  const gen = () => randomBytes(24).toString('base64url');
  const lignes = [
    ['NEXT_PUBLIC_SUPABASE_URL', URL],
    ['SUPABASE_SERVICE_ROLE_KEY', '<service_role de CE projet>'],
    ['NEXT_PUBLIC_SUPABASE_ANON_KEY', '<anon de CE projet>'],
    ['NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET', BUCKET],
    ['ADMIN_JWT_SECRET', gen()],
    ['CUSTOMER_JWT_SECRET', gen()],
    ['REPLACEMENT_SECRET', gen()],
    ['CRON_SECRET', gen()],
    ['INTERNAL_SECRET', gen()],
    ['IMPORT_SECRET', gen()],
    ['NEXT_PUBLIC_FRONT_URL', identite.front_url || '<https://boutique-du-client>'],
    ['NEXT_PUBLIC_BACKEND_URL', '<https://admin-du-client>'],
    ['STRIPE_SECRET_KEY', '<compte Stripe DU CLIENT>'],
    ['STRIPE_WEBHOOK_SECRET', '<webhook du client>'],
    ['RESEND_API_KEY / SMTP_*', '<envoi email du client>'],
    ['IMAP_* / MONDIAL_RELAY_* / LOGSPHER_* / MINDEE_API_KEY', '<selon modules actifs>'],
  ];
  for (const [k, v] of lignes) console.log(`  ${k}=${v}`);

  if (motDePasse) {
    console.log('\n═══ ACCÈS ADMIN — affiché UNE seule fois ═══');
    console.log(`  ${ADMIN}  /  ${motDePasse}`);
  }
  console.log('\nInstallation terminée. Déployer, puis se connecter et vérifier Réglages.');
})().catch(e => { console.error(e); process.exit(1); });
