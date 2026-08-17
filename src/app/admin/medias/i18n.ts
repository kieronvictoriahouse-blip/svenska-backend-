export const TME = {
  titre: { fr: 'Médiathèque', en: 'Media library', sv: 'Mediabibliotek' },
  aucun: { fr: 'Aucun fichier.', en: 'No file.', sv: 'Inga filer.' },
  chercher: { fr: 'Rechercher un fichier…', en: 'Search a file…', sv: 'Sök en fil…' },
  copierUrl: { fr: 'Copier l’URL', en: 'Copy the URL', sv: 'Kopiera URL:en' },
  msgSupprime: { fr: 'Fichier supprimé', en: 'File deleted', sv: 'Filen borttagen' },
  msgUrlCopiee: { fr: 'URL copiée', en: 'URL copied', sv: 'URL kopierad' },
};

export const imagesEnvoyees = (n: number, lang: string) =>
  lang === 'sv' ? `${n} bild${n > 1 ? 'er' : ''} uppladdad${n > 1 ? 'e' : ''}`
  : lang === 'en' ? `${n} image${n > 1 ? 's' : ''} uploaded`
  : `${n} image${n > 1 ? 's' : ''} envoyée${n > 1 ? 's' : ''}`;

export const confirmerSuppressionFichier = (nom: string, lang: string) =>
  lang === 'sv' ? `Ta bort ”${nom}”?`
  : lang === 'en' ? `Delete “${nom}”?`
  : `Supprimer « ${nom} » ?`;

export const ceFichier = (lang: string) =>
  lang === 'sv' ? 'den här filen' : lang === 'en' ? 'this file' : 'ce fichier';
