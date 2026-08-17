export const TCO = {
  exporter: { fr: 'Exporter', en: 'Export', sv: 'Exportera' },
  ajouter: { fr: 'Ajouter', en: 'Add', sv: 'Lägg till' },
  aucun: { fr: 'Aucun contact.', en: 'No contact.', sv: 'Inga kontakter.' },
  ville: { fr: 'Ville', en: 'City', sv: 'Stad' },
  totalDepense: { fr: 'Total dépensé', en: 'Total spent', sv: 'Totalt spenderat' },
  inscritLe: { fr: 'Inscrit le', en: 'Registered on', sv: 'Registrerad den' },
  segment: { fr: 'Segment', en: 'Segment', sv: 'Segment' },
  lesDeux: { fr: 'Les deux', en: 'Both', sv: 'Båda' },
  societe: { fr: 'Société', en: 'Company', sv: 'Företag' },
  prenom: { fr: 'Prénom', en: 'First name', sv: 'Förnamn' },
  codePostal: { fr: 'Code postal', en: 'Postcode', sv: 'Postnummer' },
  chercher: { fr: 'Rechercher…', en: 'Search…', sv: 'Sök…' },
  msgNomOuEmail: { fr: 'Renseigne au moins un nom ou un email', en: 'Enter at least a name or an email', sv: 'Ange minst ett namn eller en e-postadress' },
  msgEnregKo: { fr: 'Enregistrement impossible', en: 'Save failed', sv: 'Kunde inte spara' },
  msgSupprime: { fr: 'Contact supprimé', en: 'Contact deleted', sv: 'Kontakten borttagen' },
};

export const confirmerSuppressionContact = (nom: string, lang: string) =>
  lang === 'sv' ? `Ta bort ”${nom}”?`
  : lang === 'en' ? `Delete “${nom}”?`
  : `Supprimer « ${nom} » ?`;
