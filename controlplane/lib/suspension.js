/* ═══════════════════════════════════════════════════════════════
   SUSPENSION RÉVERSIBLE — côté usine

   suspendre() : pose SHOPFLOW_SUSPENDED=1 sur le projet Vercel de
   l'instance puis redéploie. Le middleware du moteur fait le reste.
   reactiver() : repose la variable à 0 et redéploie — la boutique
   revient À L'IDENTIQUE, aucune donnée n'a bougé entre-temps.

   On pose '0' plutôt que de supprimer la variable : l'upsert est
   idempotent et ne demande pas de connaître l'id de l'env, et le
   middleware ne regarde que l'égalité stricte avec '1'.
   ═══════════════════════════════════════════════════════════════ */

const vercel = require('./api-vercel');

async function poserEtRedeployer(instance, valeur) {
  if (!instance.vercel_project_id) {
    throw new Error(`instance ${instance.id} : pas de projet Vercel — rien à suspendre/réactiver`);
  }
  await vercel.poserEnv(instance.vercel_project_id, { SHOPFLOW_SUSPENDED: valeur });
  /* La variable ne vit qu'au prochain déploiement : on le déclenche. */
  const nom = (instance.url_admin || '').replace(/^https:\/\//, '').replace(/\.vercel\.app$/, '') || `instance-${instance.id}`;
  await vercel.deployer(instance.vercel_project_id, nom);
}

const suspendre = (instance) => poserEtRedeployer(instance, '1');
const reactiver = (instance) => poserEtRedeployer(instance, '0');

module.exports = { suspendre, reactiver };
