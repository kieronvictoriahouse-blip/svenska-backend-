export const TCD = {
  chargement: { fr: 'Chargement du catalogue…', en: 'Loading the catalogue…', sv: 'Laddar sortimentet…' },
  achats: { fr: 'Achats', en: 'Purchasing', sv: 'Inköp' },
  titre: { fr: 'Conditionnements', en: 'Pack sizes', sv: 'Förpackningsstorlekar' },
  retourAchats: { fr: 'Retour aux achats', en: 'Back to purchasing', sv: 'Tillbaka till inköp' },
  rechercher: { fr: 'Rechercher', en: 'Search', sv: 'Sök' },
  luDansNom: {
    fr: 'Conditionnement lu dans le nom du produit',
    en: 'Pack size read from the product name',
    sv: 'Förpackningsstorlek avläst ur produktnamnet',
  },
  selonMagasin: {
    fr: 'Conditionnement différent selon le magasin',
    en: 'Pack size differs by store',
    sv: 'Förpackningsstorleken skiljer sig mellan butiker',
  },
  msgChargement: { fr: 'Chargement impossible', en: 'Loading failed', sv: 'Kunde inte läsa in' },
  msgRienModifie: { fr: 'Rien de modifié', en: 'Nothing changed', sv: 'Inget ändrat' },
  enregistrement: { fr: 'Enregistrement…', en: 'Saving…', sv: 'Sparar…' },
  rienAEnregistrer: { fr: 'Rien à enregistrer', en: 'Nothing to save', sv: 'Inget att spara' },
  explication1: {
    fr: 'Combien d’unités par carton chez le fournisseur. L’écran de commande raisonne en cartons : tant que la valeur est à 1, « 19 cartons » veut dire 19 unités.',
    en: 'How many units per case at the supplier. The ordering screen thinks in cases: while the value is 1, “19 cases” means 19 units.',
    sv: 'Hur många enheter per kartong hos leverantören. Beställningsskärmen räknar i kartonger: så länge värdet är 1 betyder ”19 kartonger” 19 enheter.',
  },
  explication2: {
    fr: 'Laisse 1 si tu achètes bien à l’unité',
    en: 'Leave 1 if you really buy by the unit',
    sv: 'Låt stå 1 om du verkligen köper styckvis',
  },
  explication3: {
    fr: '— c’est souvent le cas en magasin. Les quantités déjà commandées sont là comme repère, elles ne pré-remplissent rien : elles disent tes habitudes d’achat, pas le carton.',
    en: '— often the case in a store. Past order quantities are shown as a reference only; they say what you usually buy, not the case size.',
    sv: '— vilket ofta gäller i butik. Tidigare beställda antal visas bara som referens; de säger vad du brukar köpa, inte kartongstorleken.',
  },
};

export const boutonEnregistrer = (n: number, lang: string) =>
  lang === 'sv' ? `Spara ${n} produkt(er)`
  : lang === 'en' ? `Save ${n} product(s)`
  : `Enregistrer ${n} produit(s)`;

export const produitsEnregistres = (n: number, lang: string) =>
  lang === 'sv' ? `${n} produkt(er) sparade`
  : lang === 'en' ? `${n} product(s) saved`
  : `${n} produit(s) enregistré(s)`;
