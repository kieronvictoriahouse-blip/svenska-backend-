export const TTI = {
  titre: { fr: 'Saisie d’un ticket de caisse', en: 'Till receipt entry', sv: 'Registrering av kvitto' },
  achats: { fr: 'Achats', en: 'Purchasing', sv: 'Inköp' },
  pays: { fr: 'Pays du ticket', en: 'Receipt country', sv: 'Kvittots land' },
  devise: { fr: 'Devise', en: 'Currency', sv: 'Valuta' },
  sansConversion: { fr: 'sans conversion', en: 'no conversion', sv: 'ingen omräkning' },
  magasin: { fr: 'Magasin', en: 'Store', sv: 'Butik' },
  dateAchat: { fr: 'Date d’achat', en: 'Purchase date', sv: 'Inköpsdatum' },
  taux: { fr: 'Taux SEK → EUR', en: 'SEK → EUR rate', sv: 'Kurs SEK → EUR' },
  alimentaire: { fr: 'Alimentaire 12 %', en: 'Food 12%', sv: 'Livsmedel 12 %' },
  standard: { fr: 'Standard 25 %', en: 'Standard 25%', sv: 'Standard 25 %' },
  controle: { fr: 'Contrôle du ticket', en: 'Receipt check', sv: 'Kvittokontroll' },
  totalLu: { fr: 'Total lu sur le ticket', en: 'Total read on the receipt', sv: 'Summa avläst på kvittot' },
  totalSaisi: { fr: 'Total des lignes saisies', en: 'Total of entered lines', sv: 'Summa av inmatade rader' },
  marchandises: { fr: 'Marchandises HT converties', en: 'Goods excl. VAT, converted', sv: 'Varor exkl. moms, omräknat' },
  lignesReconnues: { fr: 'Lignes reconnues', en: 'Lines recognised', sv: 'Igenkända rader' },
  toutValider: { fr: 'Tout valider', en: 'Validate all', sv: 'Godkänn alla' },
  coutTotal: { fr: 'Coût d’achat total', en: 'Total purchase cost', sv: 'Total inköpskostnad' },
  prixTicket: { fr: 'Prix ticket · kr', en: 'Receipt price · kr', sv: 'Kvittopris · kr' },
  ajouter: { fr: 'Ajouter', en: 'Add', sv: 'Lägg till' },
  aucuneLigne: { fr: 'Aucune ligne saisie.', en: 'No line entered.', sv: 'Ingen rad inmatad.' },
  coutHt: { fr: 'Coût HT', en: 'Cost excl. VAT', sv: 'Kostnad exkl. moms' },
  raccourcis: { fr: 'Raccourcis', en: 'Shortcuts', sv: 'Genvägar' },
  derniersAchats: { fr: 'Derniers achats · rappel', en: 'Recent purchases · reminder', sv: 'Senaste inköp · påminnelse' },
  moins: { fr: 'Moins', en: 'Less', sv: 'Färre' },
  retirer: { fr: 'Retirer', en: 'Remove', sv: 'Ta bort' },
  phRecherche: { fr: 'Tape les 3 premières lettres…', en: 'Type the first 3 letters…', sv: 'Skriv de tre första bokstäverna…' },
  prendrePhoto: { fr: 'Prendre une photo', en: 'Take a photo', sv: 'Ta ett foto' },
  importerFichier: { fr: 'Importer (PDF ou image)', en: 'Import (PDF or image)', sv: 'Importera (PDF eller bild)' },
  reprendre: { fr: 'Reprendre', en: 'Retake', sv: 'Ta om' },
  pageSuppl: { fr: 'Page suppl.', en: 'Extra page', sv: 'Extra sida' },
  lecture: { fr: 'Lecture…', en: 'Reading…', sv: 'Läser…' },
  justificatif: { fr: 'Justificatif PDF', en: 'PDF receipt', sv: 'PDF-kvitto' },
  ouvrirPdf: { fr: 'Ouvrir le PDF', en: 'Open PDF', sv: 'Öppna PDF' },
  msgPhotoKo: { fr: 'Envoi du fichier impossible', en: 'File upload failed', sv: 'Kunde inte skicka filen' },
  msgNomPrix: { fr: 'Nom et prix requis', en: 'Name and price required', sv: 'Namn och pris krävs' },
  msgAucuneLigne: { fr: 'Aucune ligne', en: 'No line', sv: 'Ingen rad' },
  msgTaux: { fr: 'Renseigne le taux de change', en: 'Enter the exchange rate', sv: 'Ange växelkursen' },
  msgBrouillon: { fr: 'Brouillon enregistré', en: 'Draft saved', sv: 'Utkast sparat' },
};

export const lignesLues = (n: number, lang: string) =>
  lang === 'sv' ? `${n} rad(er) avlästa på kvittot`
  : lang === 'en' ? `${n} line(s) read on the receipt`
  : `${n} ligne(s) lue(s) sur le ticket`;

export const commandeCreee = (numero: string, avertissement: string, lang: string) => {
  const base = lang === 'sv' ? `Order ${numero} skapad · lagret uppdaterat`
    : lang === 'en' ? `Order ${numero} created · stock updated`
    : `Commande ${numero} créée · stock mis à jour`;
  return avertissement ? `${base} — ${avertissement}` : base;
};

/** Le prix saisi s'écarte du prix d'achat connu : on demande confirmation
 *  plutôt que d'écraser un coût de revient en silence. */
export const ecartPrix = (pa: string, pourcent: number, lang: string) =>
  lang === 'sv' ? `Det angivna priset ger ett inköpspris på ${pa}, dvs. ${pourcent} % skillnad. Fortsätta?`
  : lang === 'en' ? `The entered price gives a purchase cost of ${pa}, i.e. ${pourcent}% difference. Continue?`
  : `Le prix saisi donne un PA de ${pa}, soit ${pourcent} % d’écart. Continuer ?`;
