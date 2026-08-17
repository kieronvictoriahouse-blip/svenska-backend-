export const TED = {
  testSeul: {
    fr: 'Seul cet email recevra le test — vos clients ne seront pas contactés.',
    en: 'Only this address gets the test — your customers will not be contacted.',
    sv: 'Endast denna adress får testet — dina kunder kontaktas inte.',
  },
  objetPromo: { fr: 'Objet de l’email promo', en: 'Promo email subject', sv: 'Ämne för kampanjmejlet' },
  introduction: { fr: 'Introduction', en: 'Introduction', sv: 'Inledning' },
  workflow: { fr: 'Workflow :', en: 'Workflow:', sv: 'Arbetsflöde:' },
  editezCode: {
    fr: 'Éditez le code — la prévisualisation se met à jour en direct →',
    en: 'Edit the code — the preview updates live →',
    sv: 'Redigera koden — förhandsvisningen uppdateras direkt →',
  },
  previsualisation: { fr: 'Prévisualisation', en: 'Preview', sv: 'Förhandsvisning' },
  aucunHtml: { fr: 'Aucun contenu HTML', en: 'No HTML content', sv: 'Inget HTML-innehåll' },
  selectionnez: { fr: 'Sélectionnez vos produits ci-dessus et cliquez sur', en: 'Select your products above and click', sv: 'Välj dina produkter ovan och klicka på' },
  genererEmail: { fr: 'Générer l’email', en: 'Generate the email', sv: 'Skapa mejlet' },
  phNomCampagne: { fr: 'Nom de la campagne…', en: 'Campaign name…', sv: 'Kampanjens namn…' },
  phObjet: { fr: 'Objet de l’email…', en: 'Email subject…', sv: 'Mejlets ämne…' },
  phIntro: { fr: 'Nos sélections du moment 🛍️', en: 'Our picks of the moment 🛍️', sv: 'Våra aktuella favoriter 🛍️' },
  titreApercu: { fr: 'Aperçu de l’email', en: 'Email preview', sv: 'Förhandsvisning av mejlet' },
  msgVide: { fr: '⚠️ Contenu vide', en: '⚠️ Empty content', sv: '⚠️ Tomt innehåll' },
  msgSauve: { fr: '✅ Sauvegardé !', en: '✅ Saved!', sv: '✅ Sparat!' },
  msgEmailTest: { fr: '⚠️ Saisissez votre email de test', en: '⚠️ Enter your test email', sv: '⚠️ Ange din test-e-postadress' },
  msgSauveDabord: { fr: '⚠️ Sauvegardez d’abord', en: '⚠️ Save first', sv: '⚠️ Spara först' },
  msgEditeur: { fr: '⚠️ Éditeur non prêt', en: '⚠️ Editor not ready', sv: '⚠️ Redigeraren är inte redo' },
  msgNomCampagne: { fr: '⚠️ Saisissez un nom de campagne', en: '⚠️ Enter a campaign name', sv: '⚠️ Ange ett kampanjnamn' },
  msgCampagneCreee: { fr: '✅ Campagne créée et sauvegardée !', en: '✅ Campaign created and saved!', sv: '✅ Kampanjen skapad och sparad!' },
  msgSelectCampagne: { fr: '⚠️ Sélectionnez une campagne', en: '⚠️ Select a campaign', sv: '⚠️ Välj en kampanj' },
  msgCampagneSauve: { fr: '✅ Campagne sauvegardée !', en: '✅ Campaign saved!', sv: '✅ Kampanjen sparad!' },
  msgSelectProduit: { fr: '⚠️ Sélectionnez au moins un produit', en: '⚠️ Select at least one product', sv: '⚠️ Välj minst en produkt' },
  msgPromoGenere: { fr: '✅ Email promo généré et sauvegardé !', en: '✅ Promo email generated and saved!', sv: '✅ Kampanjmejlet skapat och sparat!' },
  msgHtmlOuvert: { fr: '✅ HTML ouvert dans l’onglet', en: '✅ HTML opened in a new tab', sv: '✅ HTML öppnad i en ny flik' },
};

export const testEnvoye = (email: string, lang: string) =>
  lang === 'sv' ? `✅ Testmejl skickat till ${email}`
  : lang === 'en' ? `✅ Test email sent to ${email}`
  : `✅ Email de test envoyé à ${email}`;

export const confirmerEnvoi = (segment: string, lang: string) =>
  lang === 'sv' ? `Skicka kampanjen till ”${segment}”?`
  : lang === 'en' ? `Send this campaign to “${segment}”?`
  : `Envoyer cette campagne à « ${segment} » ?`;

export const emailsEnvoyes = (n: number, lang: string) =>
  lang === 'sv' ? `✅ ${n} mejl skickade!`
  : lang === 'en' ? `✅ ${n} emails sent!`
  : `✅ ${n} emails envoyés !`;
