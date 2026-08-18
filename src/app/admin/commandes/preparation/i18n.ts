import type { AdminLang } from '@/lib/admin-i18n';

/* Libellés de l'écran de préparation. À côté de son code plutôt que dans
   un fichier central : on les lit et on les corrige là où on les voit. */
export const TP = {
  titre: { fr: 'Préparation de commande', en: 'Order picking', sv: 'Orderplockning' },
  sous: {
    fr: 'Scanne chaque article avec le téléphone : la ligne se coche seule et le stock sort à l’expédition.',
    en: 'Scan each item with your phone: the line ticks itself and stock leaves on dispatch.',
    sv: 'Skanna varje artikel med mobilen: raden bockas av automatiskt och lagret dras av vid avsändning.',
  },
  feuille: { fr: 'Feuille de picking', en: 'Picking sheet', sv: 'Plocklista' },
  vide: {
    fr: 'Aucune commande à préparer. Les commandes payées apparaissent ici.',
    en: 'No order to pick. Paid orders appear here.',
    sv: 'Inga order att plocka. Betalda order visas här.',
  },
  file: { fr: 'File d’attente', en: 'Queue', sv: 'Kö' },
  art: { fr: 'art.', en: 'items', sv: 'art.' },
  aPreparer: { fr: 'À préparer', en: 'To pick', sv: 'Att plocka' },
  scannes: { fr: 'articles scannés', en: 'items scanned', sv: 'artiklar skannade' },
  reinit: { fr: 'Réinitialiser', en: 'Reset', sv: 'Nollställ' },
  viser: { fr: 'Vise le code-barres de l’article', en: 'Aim at the item barcode', sv: 'Rikta mot artikelns streckkod' },
  horsCmd: { fr: 'Article hors commande', en: 'Item not in this order', sv: 'Artikeln finns inte i ordern' },
  horsCmdD: { fr: 'absent de la commande', en: 'not in order', sv: 'saknas i order' },
  dejaAtteint: { fr: 'Quantité déjà atteinte', en: 'Quantity already reached', sv: 'Antalet är redan uppnått' },
  emballage: { fr: 'Emballage', en: 'Packing', sv: 'Paketering' },
  emballageD: {
    fr: 'Tous les articles sont scannés. La validation passe la commande en expédiée et prévient le client.',
    en: 'All items are scanned. Validating marks the order as shipped and notifies the customer.',
    sv: 'Alla artiklar är skannade. Godkännandet märker ordern som skickad och meddelar kunden.',
  },
  valider: { fr: 'Valider & expédier', en: 'Validate & ship', sv: 'Godkänn och skicka' },
  validation: { fr: 'Validation…', en: 'Validating…', sv: 'Godkänner…' },
  imprimerBL: { fr: 'Imprimer le BL', en: 'Print delivery note', sv: 'Skriv ut följesedel' },
  commentCa: { fr: 'Comment ça marche', en: 'How it works', sv: 'Så fungerar det' },
  etape1: { fr: 'Active la caméra et vise le code-barres.', en: 'Turn on the camera and aim at the barcode.', sv: 'Slå på kameran och rikta mot streckkoden.' },
  etape2: { fr: 'La ligne se coche seule, avec un bip et une vibration.', en: 'The line ticks itself, with a beep and a vibration.', sv: 'Raden bockas av automatiskt, med ett pip och en vibration.' },
  etape3: { fr: 'Un article hors commande est refusé.', en: 'An item not in the order is rejected.', sv: 'En artikel utanför ordern avvisas.' },
  etape4: { fr: 'À 100 %, valide : le stock sort et la commande part.', en: 'At 100%, validate: stock leaves and the order ships.', sv: 'Vid 100 %, godkänn: lagret dras av och ordern skickas.' },
  aPrelever: { fr: 'Articles à prélever', en: 'Items to pick', sv: 'Artiklar att plocka' },
  enregAvanc: { fr: 'Enregistrer l’avancement', en: 'Save progress', sv: 'Spara framsteg' },
  aucuneLigne: { fr: 'Aucune ligne rattachée à un produit.', en: 'No line linked to a product.', sv: 'Ingen rad kopplad till en produkt.' },
  sansEan: { fr: 'sans code-barres', en: 'no barcode', sv: 'ingen streckkod' },
  avertEan: {
    fr: 'Certains articles n’ont pas de code-barres : renseigne leur EAN sur la fiche produit pour pouvoir les scanner. En attendant, utilise les boutons + / −.',
    en: 'Some items have no barcode: set their EAN on the product sheet to scan them. In the meantime, use the + / − buttons.',
    sv: 'Vissa artiklar saknar streckkod: ange deras EAN på produktkortet för att kunna skanna dem. Använd + / − under tiden.',
  },
  expediee: { fr: 'expédiée · stock décrémenté', en: 'shipped · stock deducted', sv: 'skickad · lagret avdraget' },
  echecValid: { fr: 'Validation impossible', en: 'Validation failed', sv: 'Godkännandet misslyckades' },
  reliquat: { fr: 'Reliquat', en: 'Backorder', sv: 'Restorder' },
  envoiPartiel: { fr: 'Envoi partiel', en: 'Partial shipment', sv: 'Delleverans' },
  envoiPartielD: {
    fr: 'Envoie ce qui est prêt maintenant. Le reste devient un reliquat : la commande reste dans la file et tu prépares le solde quand le réassort arrive.',
    en: 'Ship what is ready now. The rest becomes a backorder: the order stays in the queue and you pack the remainder when the restock arrives.',
    sv: 'Skicka det som är klart nu. Resten blir en restorder: ordern stannar i kön och du packar resten när påfyllningen kommer.',
  },
  expedierPret: { fr: 'Expédier ce qui est prêt', en: 'Ship what is ready', sv: 'Skicka det som är klart' },
  confirmReliquat: {
    fr: 'Ces articles resteront dus au client et n’apparaîtront pas dans ce colis :',
    en: 'These items will remain owed to the customer and will not be in this parcel:',
    sv: 'Dessa artiklar förblir skyldiga kunden och ingår inte i detta paket:',
  },
  reliquatCree: { fr: 'reliquat créé, articles restant dus', en: 'backorder created, items still owed', sv: 'restorder skapad, artiklar kvar att leverera' },
  moins: { fr: 'Moins', en: 'Less', sv: 'Färre' },
  plus: { fr: 'Plus', en: 'More', sv: 'Fler' },
};

/**
 * Nom du produit dans la langue choisie.
 *
 * Préparer une commande en suédois avec des libellés français ne sert à
 * rien : celui qui prélève lit le paquet, pas la fiche. Le français reste
 * le dernier repli, parce qu'il est toujours renseigné.
 */
export function nomProduit(ligne: any, produit: any, lang: AdminLang): string {
  const prefere = lang === 'sv' ? [produit?.name_sv, ligne?.name_sv]
    : lang === 'en' ? [produit?.name_en, ligne?.name_en]
    : [];
  return prefere.find(Boolean) || ligne?.name || ligne?.name_fr || produit?.name_fr || 'Article';
}
