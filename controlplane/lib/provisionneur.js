/* ═══════════════════════════════════════════════════════════════
   PROVISIONNEUR — la machine à états qui fabrique une instance

   Chaque étape est idempotente et enregistrée dans cp_instances.etape :
   un échec au milieu se REPREND au même endroit, jamais du début — on
   ne recrée pas un projet Supabase parce que Vercel a toussé. C'est la
   leçon du moteur (réclamer avant de déduire) appliquée à l'usine.

     a_faire → base_creee → schema_joue → seed_joue → installe
             → vercel_cree → env_posees → pret

   Le pipeline est SÉQUENTIEL sur la flotte : les API de création
   limitent les rafales, et une file lente qui aboutit vaut mieux
   qu'une rafale qui laisse trois instances à moitié nées.
   ═══════════════════════════════════════════════════════════════ */

const sb = require('./api-supabase');
const vercel = require('./api-vercel');
const moteur = require('./moteur');

/**
 * Fait avancer UNE instance d'autant d'étapes que possible.
 * `depot` : lecture/écriture de l'état (cp_instances) + journal —
 * injecté pour que le CLI --dry fonctionne sans base.
 */
async function avancer(instance, client, depot) {
  const note = async (type, detail) => depot.evenement(instance.id, type, detail);
  const poser = async (patch) => { Object.assign(instance, patch); await depot.majInstance(instance.id, patch); };

  try {
    /* ── 1. La base ─────────────────────────────────────────────── */
    if (instance.etape === 'a_faire') {
      const motDePasseDb = moteur.genSecret() + 'Aa1!';
      const projet = await sb.creerProjet({ nom: `shopflow-${client.sous_domaine}`, motDePasseDb });
      const ref = projet.ref || projet.id;
      await note('base_creee', { ref });
      await poser({ supabase_ref: ref, supabase_url: `https://${ref}.supabase.co`, etape: 'base_creee' });
    }

    if (instance.etape === 'base_creee') {
      await sb.attendreActif(instance.supabase_ref);
      const cles = await sb.clesApi(instance.supabase_ref);
      await poser({ supabase_service_key: cles.service });
      instance.anon = cles.anon;
      /* Le schéma consolidé — celui du commit déployé, pas une copie. */
      await sb.executerSql(instance.supabase_ref, moteur.lireSchema());
      await note('schema_joue', { octets: moteur.lireSchema().length });
      await poser({ etape: 'schema_joue' });
    }

    if (instance.etape === 'schema_joue') {
      await sb.executerSql(instance.supabase_ref, moteur.lireSeed());
      await note('seed_joue', {});
      await poser({ etape: 'seed_joue' });
    }

    /* ── 2. L'installation applicative ──────────────────────────── */
    if (instance.etape === 'seed_joue') {
      const inst = { url: instance.supabase_url, serviceKey: instance.supabase_service_key };
      await moteur.creerBucket(inst, 'media');
      const admin = await moteur.creerAdmin(inst, client.email);
      await moteur.ecrireIdentite(inst, {
        site_name: client.nom_boutique,
        email: client.email,
        siret: client.siren || '',
        front_url: `https://${client.sous_domaine}.shopflow.fr`,
      });
      await moteur.enregistrerMigrations(inst);
      await note('installe', { admin: admin.email, motDePasseGenere: !!admin.motDePasse });
      /* Le mot de passe part dans l'email de bienvenue puis disparaît :
         le control plane ne stocke JAMAIS un mot de passe d'instance. */
      instance.motDePasseAdmin = admin.motDePasse;
      await poser({ etape: 'installe' });
    }

    /* ── 3. L'application ───────────────────────────────────────── */
    if (instance.etape === 'installe') {
      const projet = await vercel.creerProjet({ nom: `shopflow-${client.sous_domaine}` });
      await note('vercel_cree', { id: projet.id });
      await poser({
        vercel_project_id: projet.id,
        url_admin: `https://shopflow-${client.sous_domaine}.vercel.app`,
        url_boutique: `https://${client.sous_domaine}.shopflow.fr`,
        etape: 'vercel_cree',
      });
    }

    if (instance.etape === 'vercel_cree') {
      const variables = moteur.variablesInstance({
        url: instance.supabase_url,
        anon: instance.anon || '',
        serviceKey: instance.supabase_service_key,
        bucket: 'media',
        urlAdmin: instance.url_admin,
        urlBoutique: instance.url_boutique,
      });
      await vercel.poserEnv(instance.vercel_project_id, variables);
      await note('env_posees', { nombre: Object.keys(variables).length });
      /* Le CRON_SECRET est le seul secret d'instance gardé : il sert à
         déclencher les audits de flotte. */
      await poser({ cron_secret: variables.CRON_SECRET, etape: 'env_posees' });
    }

    if (instance.etape === 'env_posees') {
      await vercel.deployer(instance.vercel_project_id, `shopflow-${client.sous_domaine}`);
      await note('pret', {});
      await poser({ etape: 'pret', erreur: null });

      /* L'email de bienvenue part MAINTENANT, pendant que le mot de
         passe est encore en mémoire — il n'est stocké nulle part.
         Reprise après échec entre installe et pret : le mot de passe
         est perdu, l'email part quand même avec la consigne « mot de
         passe oublié ». Pas de clé Resend : on journalise pour envoi
         à la main. */
      const { envoyerBienvenue } = require('./email');
      const parti = await envoyerBienvenue({
        nomBoutique: client.nom_boutique,
        email: client.email,
        motDePasse: instance.motDePasseAdmin || null,
        urlAdmin: instance.url_admin,
      });
      await note(parti ? 'bienvenue_envoyee' : 'bienvenue_a_envoyer', {
        email: client.email, url_admin: instance.url_admin,
        motDePasseInclus: !!instance.motDePasseAdmin,
      });
      delete instance.motDePasseAdmin;
    }

    return instance;
  } catch (e) {
    await note('echec', { etape: instance.etape, erreur: String(e.message || e) });
    /* L'étape N'AVANCE PAS : le prochain passage reprend exactement là.
       `erreur` porte le diagnostic pour le tableau de bord. */
    await depot.majInstance(instance.id, { erreur: String(e.message || e) });
    throw e;
  }
}

module.exports = { avancer };
