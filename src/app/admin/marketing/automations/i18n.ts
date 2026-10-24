export const TAU = {
  titre: { fr: 'Automations', en: 'Automations', sv: 'Automatiseringar' },
  objetEmail: { fr: 'Objet de l’email', en: 'Email subject', sv: 'Mejlets ämne' },
  sequences: { fr: 'Séquences disponibles', en: 'Available sequences', sv: 'Tillgängliga sekvenser' },
  activer: { fr: 'Activer', en: 'Enable', sv: 'Aktivera' },
  msgChangement: { fr: 'Changement impossible', en: 'Change failed', sv: 'Ändringen misslyckades' },
  msgExisteDeja: { fr: 'Cette automation existe déjà', en: 'This automation already exists', sv: 'Automatiseringen finns redan' },
  msgCreee: { fr: 'Automation créée et activée', en: 'Automation created and enabled', sv: 'Automatiseringen skapad och aktiverad' },
  msgCreationKo: { fr: 'Création impossible', en: 'Creation failed', sv: 'Kunde inte skapa' },
  msgMaj: { fr: 'Automation mise à jour', en: 'Automation updated', sv: 'Automatiseringen uppdaterad' },
  msgConfirmDel: { fr: 'Supprimer cette automation ?', en: 'Delete this automation?', sv: 'Ta bort automatiseringen?' },
  msgSupprimee: { fr: 'Automation supprimée', en: 'Automation deleted', sv: 'Automatiseringen borttagen' },
  /* Le délai affiché est un minimum : le cron ne passe qu'une fois par
     jour (vercel.json, 9 h UTC). */
  passage: {
    fr: 'Envois au passage quotidien (11 h l’été, 10 h l’hiver) : le délai est un minimum, jusqu’à 24 h de plus.',
    en: 'Sent at the daily run (11 am in summer, 10 am in winter, Paris time): the delay is a minimum, up to 24 h more.',
    sv: 'Skickas vid den dagliga körningen (kl. 11 på sommaren, 10 på vintern, Paristid): fördröjningen är ett minimum, upp till 24 h till.',
  },
};

export const cronExecute = (n: number, lang: string) =>
  lang === 'sv' ? `Cron körd: ${n} mejl skickade`
  : lang === 'en' ? `Cron run: ${n} email(s) sent`
  : `Cron exécuté : ${n} email(s) envoyé(s)`;
