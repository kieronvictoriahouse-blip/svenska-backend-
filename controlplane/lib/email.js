/* ═══════════════════════════════════════════════════════════════
   EMAIL DE BIENVENUE — le seul moment où le mot de passe existe

   Envoyé quand l'instance atteint « pret », pendant que le mot de
   passe admin est encore en mémoire (le control plane ne le stocke
   JAMAIS). Si la variable RESEND_API_KEY manque, ou si le mot de
   passe a été perdu (reprise après échec entre deux étapes), on
   journalise `bienvenue_a_envoyer` : un humain envoie l'email et
   déclenche une réinitialisation — on ne bloque pas l'usine pour ça.

   Variables CP : RESEND_API_KEY, RESEND_FROM (ex. Shopflow
   <bonjour@shopflow.fr> — le domaine doit être vérifié chez Resend).
   ═══════════════════════════════════════════════════════════════ */

function corpsBienvenue({ nomBoutique, email, motDePasse, urlAdmin }) {
  return [
    `Bonjour,`,
    ``,
    `Votre boutique « ${nomBoutique} » est prête.`,
    ``,
    `Votre back-office : ${urlAdmin}/login`,
    `Identifiant : ${email}`,
    motDePasse ? `Mot de passe : ${motDePasse}` : `Mot de passe : utilisez « mot de passe oublié » sur la page de connexion.`,
    ``,
    `Ce mot de passe ne vous sera jamais redemandé par email — changez-le`,
    `dès votre première connexion (Réglages → Mon compte).`,
    ``,
    `Bonne vente,`,
    `Shopflow`,
  ].join('\n');
}

/** Envoie l'email de bienvenue. Retourne true si parti, false sinon
 *  (jamais d'exception : un email raté ne doit pas casser l'usine). */
async function envoyerBienvenue({ nomBoutique, email, motDePasse, urlAdmin }) {
  const cle = process.env.RESEND_API_KEY;
  const de = process.env.RESEND_FROM;
  if (!cle || !de) return false;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + cle, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: de,
        to: [email],
        subject: `Votre boutique « ${nomBoutique} » est prête`,
        text: corpsBienvenue({ nomBoutique, email, motDePasse, urlAdmin }),
      }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

module.exports = { envoyerBienvenue };
