import { LOCALES, type AdminLang } from '@/lib/admin-i18n';

export const TRD = {
  modele: { fr: 'Modèle…', en: 'Template…', sv: 'Mall…' },
  signature: { fr: 'Signature ajoutée à l’envoi', en: 'Signature added on sending', sv: 'Signatur läggs till vid sändning' },
  phMessage: { fr: 'Écris ton message…', en: 'Write your message…', sv: 'Skriv ditt meddelande…' },
  programmer: { fr: 'Programmer l’envoi', en: 'Schedule sending', sv: 'Schemalägg sändningen' },
  brouillon: { fr: 'Enregistrer comme brouillon', en: 'Save as draft', sv: 'Spara som utkast' },
  joindre: { fr: 'Joindre un fichier', en: 'Attach a file', sv: 'Bifoga en fil' },
  msgBrouillon: { fr: 'Brouillon enregistré', en: 'Draft saved', sv: 'Utkast sparat' },
  msgModeleKo: { fr: 'Modèle illisible', en: 'Template unreadable', sv: 'Mallen kunde inte läsas' },
  /* Ce que « programmer » veut vraiment dire : aucun automate ne tourne à
     l'heure dite (un seul passage automatique par jour sur Vercel). */
  notePrevue: {
    fr: 'Il part à la première relève de la boîte après cette heure (« Envoyer / recevoir »), sinon au passage automatique du matin (6 h l’hiver, 7 h l’été).',
    en: 'It goes out at the first mailbox check after this time (“Send / receive”), otherwise at the automatic morning run (6 am in winter, 7 am in summer, Paris time).',
    sv: 'Det skickas vid första hämtningen efter denna tid (”Skicka / ta emot”), annars vid den automatiska körningen på morgonen (kl. 6 på vintern, 7 på sommaren, Paristid).',
  },
  pjTropLourdes: { fr: 'Pièces jointes trop lourdes — 3 Mo maximum au total', en: 'Attachments too large — 3 MB maximum in total', sv: 'Bilagorna är för stora — högst 3 MB totalt' },
};

/** La date suit la langue : « 3 septembre » n'a pas sa place dans une
 *  interface suédoise. */
export const envoiProgramme = (quand: string, lang: AdminLang) => {
  const d = new Date(quand).toLocaleString(LOCALES[lang], {
    day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit',
  });
  return lang === 'sv' ? `Sändning schemalagd till ${d}`
    : lang === 'en' ? `Sending scheduled for ${d}`
    : `Envoi programmé pour le ${d}`;
};

export const modeleInsere = (nom: string, lang: string) =>
  lang === 'sv' ? `Mallen ”${nom}” infogad — läs igenom innan du skickar`
  : lang === 'en' ? `Template “${nom}” inserted — read it over before sending`
  : `Modèle « ${nom} » inséré — relis avant d’envoyer`;
