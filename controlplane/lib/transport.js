/* ═══════════════════════════════════════════════════════════════
   TRANSPORT — un seul point de sortie HTTP pour tout le robot

   Deux raisons d'exister :

   · le mode --dry : chaque appel est enregistré au lieu d'être émis,
     avec une réponse simulée plausible. On peut dérouler TOUT le
     pipeline de provisionnement sans toucher à une seule API — c'est
     comme ça qu'il se teste, et c'est comme ça qu'on le relit avant de
     lui confier des jetons qui créent des projets facturables ;

   · la trace : en mode réel, chaque appel est journalisé (méthode,
     hôte, statut, durée) — un provisionnement qui échoue se relit.
   ═══════════════════════════════════════════════════════════════ */

let MODE_DRY = false;
const APPELS = [];

function activerDry() { MODE_DRY = true; APPELS.length = 0; }
function journalDry() { return APPELS; }

/* Réponses simulées : juste assez vraies pour que le pipeline avance. */
function simuler(methode, url, corps) {
  const u = String(url);
  if (u.includes('api.supabase.com/v1/projects') && methode === 'POST' && !u.includes('/database'))
    return { id: 'refdry01', ref: 'refdry01', status: 'COMING_UP' };
  if (u.match(/api\.supabase\.com\/v1\/projects\/[^/]+$/))
    return { id: 'refdry01', ref: 'refdry01', status: 'ACTIVE_HEALTHY' };
  if (u.includes('/api-keys'))
    return [
      { name: 'anon', api_key: 'dry-anon' },
      { name: 'service_role', api_key: 'dry-service' },
    ];
  if (u.includes('/database/query')) return [];
  if (u.includes('api.vercel.com') && u.includes('/projects') && methode === 'POST')
    return { id: 'prj_dry', name: corps?.name || 'dry' };
  if (u.includes('api.vercel.com') && u.includes('/env')) return { created: true };
  if (u.includes('api.vercel.com') && u.includes('/deployments')) return { id: 'dpl_dry', url: 'dry.vercel.app' };
  if (u.includes('/auth/v1/admin/users')) return { id: 'user-dry', email: corps?.email };
  if (u.includes('/storage/v1/bucket')) return { name: corps?.id };
  if (u.includes('/rest/v1/white_label_config')) return [{ id: 'cfg-dry' }];
  if (u.includes('/rest/v1/')) return [];
  return {};
}

async function appeler(methode, url, { headers = {}, corps = null } = {}) {
  if (MODE_DRY) {
    const simulé = simuler(methode, url, corps);
    APPELS.push({ methode, url: String(url), corps });
    return { ok: true, status: 200, json: async () => simulé, text: async () => JSON.stringify(simulé) };
  }
  const debut = Date.now();
  const r = await fetch(url, {
    method: methode,
    headers: { 'Content-Type': 'application/json', ...headers },
    ...(corps !== null ? { body: JSON.stringify(corps) } : {}),
  });
  console.log(`  [http] ${methode} ${new URL(url).host}${new URL(url).pathname} → ${r.status} (${Date.now() - debut}ms)`);
  return r;
}

module.exports = { appeler, activerDry, journalDry };
