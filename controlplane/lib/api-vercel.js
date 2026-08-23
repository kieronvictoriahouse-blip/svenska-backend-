/* ═══════════════════════════════════════════════════════════════
   API VERCEL — un projet par instance, branché sur LE dépôt moteur

   Jeton : vercel.com → Settings → Tokens. VERCEL_TEAM_ID si le compte
   est une équipe (sinon laisser vide).

   Chaque instance = un projet Vercel pointant le MÊME dépôt GitHub :
   un push sur main met toute la flotte à jour, c'est le contrat de
   l'abonnement. Seules les variables d'environnement diffèrent.
   ═══════════════════════════════════════════════════════════════ */

const { appeler } = require('./transport');

const BASE = 'https://api.vercel.com';
const team = () => (process.env.VERCEL_TEAM_ID ? `?teamId=${process.env.VERCEL_TEAM_ID}` : '');
const entetes = () => ({ Authorization: 'Bearer ' + process.env.VERCEL_TOKEN });

async function creerProjet({ nom }) {
  const r = await appeler('POST', `${BASE}/v11/projects${team()}`, {
    headers: entetes(),
    corps: {
      name: nom,
      framework: 'nextjs',
      gitRepository: {
        type: 'github',
        repo: process.env.MOTEUR_GITHUB_REPO,   // ex. kieronvictoriahouse-blip/svenska-backend-
      },
      /* Le moteur vit à la racine du dépôt ; le control plane dans
         controlplane/ — chaque projet Vercel choisit sa racine. */
      rootDirectory: null,
    },
  });
  if (!r.ok) throw new Error('création projet Vercel : ' + await r.text());
  return r.json();
}

/** Pose les variables d'environnement — production uniquement. */
async function poserEnv(projectId, variables) {
  const corps = Object.entries(variables).map(([key, value]) => ({
    key, value: String(value),
    type: key.startsWith('NEXT_PUBLIC_') ? 'plain' : 'encrypted',
    target: ['production', 'preview'],
  }));
  const r = await appeler('POST', `${BASE}/v10/projects/${projectId}/env${team()}&upsert=true`.replace('?&', '?').replace(/env&/, 'env?'), {
    headers: entetes(),
    corps,
  });
  if (!r.ok) throw new Error('env Vercel : ' + await r.text());
  return r.json();
}

/** Déclenche le premier déploiement depuis la branche main. */
async function deployer(projectId, nom) {
  const r = await appeler('POST', `${BASE}/v13/deployments${team()}`, {
    headers: entetes(),
    corps: {
      name: nom,
      project: projectId,
      target: 'production',
      gitSource: { type: 'github', repo: process.env.MOTEUR_GITHUB_REPO, ref: 'main' },
    },
  });
  if (!r.ok) throw new Error('déploiement : ' + await r.text());
  return r.json();
}

module.exports = { creerProjet, poserEnv, deployer };
