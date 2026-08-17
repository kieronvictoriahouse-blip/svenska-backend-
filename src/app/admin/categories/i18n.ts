/* « Nom FR / SV / EN » désigne les champs de contenu à remplir, pas la
   langue de l'interface : les suffixes restent en clair. */
export const TCA = {
  titre: { fr: 'Catégories', en: 'Categories', sv: 'Kategorier' },
  nomFr: { fr: 'Nom FR *', en: 'Name FR *', sv: 'Namn FR *' },
  nomSv: { fr: 'Nom SV', en: 'Name SV', sv: 'Namn SV' },
  nomEn: { fr: 'Nom EN', en: 'Name EN', sv: 'Namn EN' },
  aucune: { fr: 'Aucune catégorie.', en: 'No category.', sv: 'Inga kategorier.' },
  categorie: { fr: 'Catégorie', en: 'Category', sv: 'Kategori' },
  visible: { fr: 'Visible', en: 'Visible', sv: 'Synlig' },
  msgCreee: { fr: 'Catégorie créée', en: 'Category created', sv: 'Kategorin skapad' },
  msgEnregKo: { fr: 'Enregistrement impossible', en: 'Save failed', sv: 'Kunde inte spara' },
  msgSupprimee: { fr: 'Catégorie supprimée', en: 'Category deleted', sv: 'Kategorin borttagen' },
  msgOrdre: { fr: 'Ordre mis à jour', en: 'Order updated', sv: 'Ordningen uppdaterad' },
};

export const confirmerSuppressionCategorie = (nom: string, lang: string) =>
  lang === 'sv' ? `Ta bort kategorin ”${nom}”?`
  : lang === 'en' ? `Delete the category “${nom}”?`
  : `Supprimer la catégorie « ${nom} » ?`;
