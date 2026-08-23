/* ═══════════════════════════════════════════════════════════════
   CLI DU PROVISIONNEUR

   node provisionner.js --dry --nom "Fromagerie Dupont" \
     --email jean@dupont.fr --sous-domaine fromagerie-dupont

   --dry : déroule TOUT le pipeline sans toucher à aucune API — chaque
   appel HTTP qui AURAIT été émis est listé. C'est la relecture
   obligatoire avant de confier des jetons au robot, et le test de
   non-régression du pipeline.

   Sans --dry : exige SUPABASE_MGMT_TOKEN, SUPABASE_ORG_ID,
   VERCEL_TOKEN, MOTEUR_GITHUB_REPO — et une base control plane
   (CP_SUPABASE_URL / CP_SUPABASE_KEY, tables de cp-schema.sql).
   ═══════════════════════════════════════════════════════════════ */

const { activerDry, journalDry } = require('./lib/transport');
const { avancer } = require('./lib/provisionneur');

const arg = (nom, defaut = '') => {
  const i = process.argv.indexOf('--' + nom);
  return i > -1 ? String(process.argv[i + 1] || '') : defaut;
};
const DRY = process.argv.includes('--dry');

/* Dépôt d'état : en mémoire pour --dry, Supabase sinon. */
function depotMemoire() {
  return {
    async majInstance(id, patch) { /* état porté par l'objet lui-même */ },
    async evenement(id, type, detail) {
      console.log(`  [étape] ${type}${detail && Object.keys(detail).length ? ' ' + JSON.stringify(detail) : ''}`);
    },
  };
}

function depotSupabase() {
  const U = process.env.CP_SUPABASE_URL, K = process.env.CP_SUPABASE_KEY;
  if (!U || !K) { console.error('CP_SUPABASE_URL / CP_SUPABASE_KEY requis hors --dry'); process.exit(1); }
  const H = { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' };
  return {
    async majInstance(id, patch) {
      await fetch(`${U}/rest/v1/cp_instances?id=eq.${id}`, {
        method: 'PATCH', headers: H,
        body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
      });
    },
    async evenement(id, type, detail) {
      console.log(`  [étape] ${type}`);
      await fetch(`${U}/rest/v1/cp_evenements`, {
        method: 'POST', headers: H,
        body: JSON.stringify({ instance_id: id, type, detail }),
      });
    },
  };
}

(async () => {
  const client = {
    email: arg('email', 'test@exemple.fr'),
    nom_boutique: arg('nom', 'Boutique Exemple'),
    siren: arg('siren', ''),
    sous_domaine: arg('sous-domaine', 'exemple'),
  };
  if (!/^[a-z0-9][a-z0-9-]{2,40}$/.test(client.sous_domaine)) {
    console.error('sous-domaine invalide (a-z, 0-9, tirets, 3-41 caractères)');
    process.exit(1);
  }

  console.log(`═══ PROVISIONNEMENT ${DRY ? '(--dry, aucun appel réel)' : ''} ═══`);
  console.log(`  boutique : ${client.nom_boutique} · ${client.sous_domaine}.shopflow.fr · ${client.email}\n`);

  if (DRY) activerDry();
  const depot = DRY ? depotMemoire() : depotSupabase();

  const instance = { id: 'cli-' + Date.now(), etape: arg('reprendre-a', 'a_faire') };
  await avancer(instance, client, depot);

  console.log(`\n  Instance prête : ${instance.url_admin || '(dry)'}`);
  if (instance.motDePasseAdmin) {
    console.log(`  Admin : ${client.email} / ${instance.motDePasseAdmin}   ← à transmettre puis oublier`);
  }

  if (DRY) {
    const appels = journalDry();
    console.log(`\n─── ${appels.length} appels HTTP qui auraient été émis ───`);
    for (const a of appels) {
      const u = new URL(a.url);
      console.log(`  ${a.methode.padEnd(6)} ${u.host}${u.pathname}${a.corps && a.corps.query ? '   [SQL ' + a.corps.query.length + ' o]' : ''}`);
    }
  }
})().catch(e => { console.error('\nÉCHEC :', e.message); process.exit(1); });
