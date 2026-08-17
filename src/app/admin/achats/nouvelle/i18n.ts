export const TNC = {
  chargement: { fr: 'Chargement du catalogue…', en: 'Loading the catalogue…', sv: 'Laddar sortimentet…' },
  filAriane: { fr: 'Achats · Commandes d’achat', en: 'Purchasing · Purchase orders', sv: 'Inköp · Inköpsorder' },
  remplirAuto: { fr: 'Remplir automatiquement', en: 'Fill automatically', sv: 'Fyll automatiskt' },
  transportTnt: { fr: 'Transport (TNT, colis)', en: 'Freight (TNT, parcel)', sv: 'Frakt (TNT, paket)' },
  marchandiseMagasin: { fr: 'Marchandise (magasin)', en: 'Goods (store)', sv: 'Varor (butik)' },
  marchandiseHt: { fr: 'Marchandise HT', en: 'Goods excl. VAT', sv: 'Varor exkl. moms' },
  transport: { fr: 'Transport', en: 'Freight', sv: 'Frakt' },
  auMoinsUne: { fr: 'Au moins une ligne', en: 'At least one line', sv: 'Minst en rad' },
  rienAReappro: {
    fr: 'Rien à réapprovisionner dans ce filtre — bonne nouvelle.',
    en: 'Nothing to replenish in this filter — good news.',
    sv: 'Inget att fylla på i det här filtret — goda nyheter.',
  },
  commandeEnregistree: { fr: 'Commande enregistrée', en: 'Order saved', sv: 'Ordern sparad' },
  retourAchats: { fr: 'Retour aux achats', en: 'Back to purchasing', sv: 'Tillbaka till inköp' },
  portePartTransport: {
    fr: 'Cet article porte une part du transport',
    en: 'This item bears a share of the freight',
    sv: 'Artikeln bär en del av frakten',
  },
  cartonMoins: { fr: 'Un carton de moins', en: 'One case fewer', sv: 'En kartong färre' },
  cartonPlus: { fr: 'Un carton de plus', en: 'One case more', sv: 'En kartong till' },
  rechercher: { fr: 'Rechercher', en: 'Search', sv: 'Sök' },
  msgIntrouvable: { fr: 'Commande introuvable', en: 'Order not found', sv: 'Ordern hittades inte' },
  msgChargement: { fr: 'Chargement impossible', en: 'Loading failed', sv: 'Kunde inte läsa in' },
  msgChangerMagasin: {
    fr: 'Changer de magasin vide le panier — les prix et les cartons diffèrent. Continuer ?',
    en: 'Switching store empties the cart — prices and case sizes differ. Continue?',
    sv: 'Att byta butik tömmer varukorgen — priser och kartongstorlekar skiljer sig. Fortsätta?',
  },
  msgRienAAjouter: {
    fr: 'Rien à ajouter : tout ce qui presse est déjà au panier',
    en: 'Nothing to add: everything urgent is already in the cart',
    sv: 'Inget att lägga till: allt brådskande finns redan i varukorgen',
  },
};

export const referencesAjoutees = (n: number, lang: string) =>
  lang === 'sv' ? `${n} artikel/artiklar tillagda utifrån din försäljningstakt`
  : lang === 'en' ? `${n} item(s) added based on your sales rate`
  : `${n} référence(s) ajoutée(s) d’après ton rythme de vente`;
