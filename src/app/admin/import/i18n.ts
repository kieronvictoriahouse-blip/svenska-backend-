export const TIM = {
  titre: { fr: 'Import depuis une URL', en: 'Import from a URL', sv: 'Import från en URL' },
  analyse: { fr: 'Analyse de la page en cours…', en: 'Analysing the page…', sv: 'Analyserar sidan…' },
  identite: { fr: 'Identité produit', en: 'Product identity', sv: 'Produktidentitet' },
  emoji: { fr: 'Emoji', en: 'Emoji', sv: 'Emoji' },
  marque: { fr: 'Marque', en: 'Brand', sv: 'Varumärke' },
  accroche: { fr: 'Accroche', en: 'Tagline', sv: 'Slogan' },
  description: { fr: 'Description', en: 'Description', sv: 'Beskrivning' },
  prixVente: { fr: 'Prix de vente (€)', en: 'Selling price (€)', sv: 'Försäljningspris (€)' },
  poidsFormat: { fr: 'Poids / format', en: 'Weight / size', sv: 'Vikt / format' },
  origine: { fr: 'Origine', en: 'Origin', sv: 'Ursprung' },
  categorie: { fr: 'Catégorie', en: 'Category', sv: 'Kategori' },
  ingredientsAllergenes: { fr: 'Ingrédients & allergènes', en: 'Ingredients & allergens', sv: 'Ingredienser och allergener' },
  ingredients: { fr: 'Ingrédients', en: 'Ingredients', sv: 'Ingredienser' },
  allergenes: { fr: 'Allergènes', en: 'Allergens', sv: 'Allergener' },
  conservationUtil: { fr: 'Conservation & utilisation', en: 'Storage & use', sv: 'Förvaring och användning' },
  conservation: { fr: 'Conservation', en: 'Storage', sv: 'Förvaring' },
  suggestions: { fr: 'Suggestions d’utilisation', en: 'Serving suggestions', sv: 'Serveringsförslag' },
  nutrition: { fr: 'Valeurs nutritionnelles', en: 'Nutrition facts', sv: 'Näringsvärde' },
  images: { fr: 'Images', en: 'Images', sv: 'Bilder' },
  imagePrincipale: { fr: 'Image principale', en: 'Main image', sv: 'Huvudbild' },
  aucuneImage: { fr: 'Aucune image sélectionnée', en: 'No image selected', sv: 'Ingen bild vald' },
  imagesTrouvees: { fr: 'Images trouvées sur la page', en: 'Images found on the page', sv: 'Bilder som hittats på sidan' },
  source: { fr: 'Source', en: 'Source', sv: 'Källa' },
  phIngredients: { fr: 'Sel, maltodextrine, poudre d’oignon…', en: 'Salt, maltodextrin, onion powder…', sv: 'Salt, maltodextrin, lökpulver…' },
  phAllergenes: { fr: 'Contient : gluten, lait…', en: 'Contains: gluten, milk…', sv: 'Innehåller: gluten, mjölk…' },
  phConservation: { fr: 'Conserver à l’abri de la chaleur…', en: 'Keep away from heat…', sv: 'Förvaras svalt…' },
  phSuggestions: { fr: 'Parfait avec des chips, en trempette…', en: 'Great with crisps, as a dip…', sv: 'Perfekt till chips, som dipp…' },
  ajouterGalerie: { fr: 'Ajouter à la galerie', en: 'Add to the gallery', sv: 'Lägg till i galleriet' },
};

export const ajouteAuCatalogue = (nom: string, lang: string) =>
  lang === 'sv' ? `”${nom}” tillagd i sortimentet`
  : lang === 'en' ? `“${nom}” added to the catalogue`
  : `« ${nom} » ajouté au catalogue`;
