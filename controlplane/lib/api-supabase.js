/* ═══════════════════════════════════════════════════════════════
   API SUPABASE MANAGEMENT — créer et piloter les bases des instances

   Jeton personnel (sbp_…) : Dashboard → Account → Access Tokens.
   C'est LA clé de la flotte côté données — elle ne sort jamais du
   control plane.

   Le point décisif : POST /v1/projects/{ref}/database/query exécute du
   SQL arbitraire. Le robot joue donc schema.sql, seed.sql et les
   migrations lui-même — plus jamais de collage manuel.
   ═══════════════════════════════════════════════════════════════ */

const { appeler } = require('./transport');

const BASE = 'https://api.supabase.com/v1';
const entetes = () => ({ Authorization: 'Bearer ' + process.env.SUPABASE_MGMT_TOKEN });

async function creerProjet({ nom, motDePasseDb, region = 'eu-west-3' }) {
  const r = await appeler('POST', `${BASE}/projects`, {
    headers: entetes(),
    corps: {
      name: nom,
      organization_id: process.env.SUPABASE_ORG_ID,
      db_pass: motDePasseDb,
      region,
    },
  });
  if (!r.ok) throw new Error('création projet Supabase : ' + await r.text());
  return r.json();          // { id/ref, status: COMING_UP, ... }
}

/** Un projet neuf met 1 à 3 minutes à démarrer. On attend, on ne devine pas. */
async function attendreActif(ref, { essais = 60, pauseMs = 5000 } = {}) {
  for (let i = 0; i < essais; i++) {
    const r = await appeler('GET', `${BASE}/projects/${ref}`, { headers: entetes() });
    if (r.ok) {
      const p = await r.json();
      if (p.status === 'ACTIVE_HEALTHY') return p;
    }
    await new Promise(res => setTimeout(res, pauseMs));
  }
  throw new Error(`projet ${ref} toujours pas actif après ${essais} contrôles`);
}

async function clesApi(ref) {
  const r = await appeler('GET', `${BASE}/projects/${ref}/api-keys`, { headers: entetes() });
  if (!r.ok) throw new Error('clés API : ' + await r.text());
  const liste = await r.json();
  const de = n => (liste.find(k => k.name === n) || {}).api_key || '';
  return { anon: de('anon'), service: de('service_role') };
}

/** Exécute du SQL sur la base de l'instance — schéma, seed, migrations. */
async function executerSql(ref, sql) {
  const r = await appeler('POST', `${BASE}/projects/${ref}/database/query`, {
    headers: entetes(),
    corps: { query: sql },
  });
  if (!r.ok) throw new Error('SQL : ' + await r.text());
  return r.json();
}

/** Pause (impayé prolongé) et reprise. Jamais de suppression ici :
    la suppression d'une base cliente est un geste humain, documenté. */
async function pauserProjet(ref) {
  const r = await appeler('POST', `${BASE}/projects/${ref}/pause`, { headers: entetes() });
  if (!r.ok) throw new Error('pause : ' + await r.text());
}

module.exports = { creerProjet, attendreActif, clesApi, executerSql, pauserProjet };
