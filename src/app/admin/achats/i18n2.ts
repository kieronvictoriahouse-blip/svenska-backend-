/* Complément au dictionnaire `T` déjà présent dans achats/page.tsx :
   ajouté à part pour ne pas déplacer l'existant, qui est consommé par
   son propre `t()`. */
export const TAC = {
  conditionnements: { fr: 'Conditionnements', en: 'Pack sizes', sv: 'Förpackningsstorlekar' },
  conditionnementsTitre: { fr: 'Unités par carton', en: 'Units per case', sv: 'Enheter per kartong' },
  saisieManuelle: { fr: 'Saisie manuelle', en: 'Manual entry', sv: 'Manuell inmatning' },
  suggestions: { fr: 'Suggestions de réapprovisionnement', en: 'Replenishment suggestions', sv: 'Påfyllningsförslag' },
  urgence: { fr: 'Urgence', en: 'Urgency', sv: 'Brådska' },
  ventes90: { fr: 'Ventes 90 j', en: 'Sales 90 d', sv: 'Försäljning 90 d' },
  parJour: { fr: 'Par jour', en: 'Per day', sv: 'Per dag' },
  autonomie: { fr: 'Autonomie', en: 'Days of cover', sv: 'Räckvidd' },
  commander: { fr: 'Commander', en: 'Order', sv: 'Beställ' },
  lignes: { fr: 'Lignes', en: 'Lines', sv: 'Rader' },
  langueDoc: { fr: 'Langue du document', en: 'Document language', sv: 'Dokumentets språk' },
  emailFournisseur: { fr: 'Email fournisseur (pour envoi)', en: 'Supplier email (for sending)', sv: 'Leverantörens e-post (för utskick)' },
  bonA4: { fr: 'Bon de commande A4', en: 'A4 purchase order', sv: 'Inköpsorder A4' },
  pdfEnvoyer: { fr: 'PDF / Envoyer', en: 'PDF / Send', sv: 'PDF / Skicka' },
  msgTauxKo: { fr: '❌ Impossible de récupérer le taux', en: '❌ Could not fetch the rate', sv: '❌ Kunde inte hämta kursen' },
  msgTauxManquant: {
    fr: '⚠️ Taux de change non chargé — sélectionnez la devise à nouveau',
    en: '⚠️ Exchange rate not loaded — select the currency again',
    sv: '⚠️ Växelkursen är inte laddad — välj valutan igen',
  },
  msgPdfGen: { fr: '⏳ Génération PDF…', en: '⏳ Generating PDF…', sv: '⏳ Skapar PDF…' },
  msgPdfGenKo: { fr: '❌ Erreur génération PDF', en: '❌ PDF generation failed', sv: '❌ PDF-genereringen misslyckades' },
  msgPdfOk: { fr: '✅ PDF téléchargé', en: '✅ PDF downloaded', sv: '✅ PDF nedladdad' },
  msgPdfKo: { fr: '❌ Erreur téléchargement PDF', en: '❌ PDF download failed', sv: '❌ PDF-nedladdningen misslyckades' },
  msgMailOk: { fr: '✅ PDF envoyé par email', en: '✅ PDF sent by email', sv: '✅ PDF skickad via e-post' },
  msgMailKo: { fr: '❌ Erreur envoi email', en: '❌ Email sending failed', sv: '❌ E-postutskicket misslyckades' },
};

export const tauxDuJour = (devise: string, taux: number, date: string, lang: string) =>
  lang === 'sv' ? `✅ 1 ${devise} = ${taux} EUR (${date})`
  : `✅ 1 ${devise} = ${taux} EUR (${date})`;
