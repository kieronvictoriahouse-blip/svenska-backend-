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
};

export const cronExecute = (n: number, lang: string) =>
  lang === 'sv' ? `Cron körd: ${n} mejl skickade`
  : lang === 'en' ? `Cron run: ${n} email(s) sent`
  : `Cron exécuté : ${n} email(s) envoyé(s)`;
