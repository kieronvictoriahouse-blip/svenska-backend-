export const TCP = {
  titre: { fr: 'Comptabilité', en: 'Accounting', sv: 'Bokföring' },
  sous: {
    fr: 'Micro-entreprise · BIC marchandises · TVA non applicable (art. 293 B)',
    en: 'Micro-business · goods trading · VAT not applicable (art. 293 B)',
    sv: 'Mikroföretag · varuhandel · moms ej tillämplig (art. 293 B)',
  },
  export: { fr: 'Export comptable', en: 'Accounting export', sv: 'Bokföringsexport' },
  dernieres: { fr: 'Dernières écritures', en: 'Latest entries', sv: 'Senaste poster' },
  aucune: { fr: 'Aucune écriture', en: 'No entry', sv: 'Inga poster' },
  cotisations: { fr: 'Cotisations & seuils', en: 'Contributions & thresholds', sv: 'Avgifter och trösklar' },
  description: { fr: 'Description', en: 'Description', sv: 'Beskrivning' },
  montant: { fr: 'Montant', en: 'Amount', sv: 'Belopp' },
  categorie: { fr: 'Catégorie', en: 'Category', sv: 'Kategori' },
  phDescription: { fr: 'Achat marchandises…', en: 'Goods purchase…', sv: 'Varuinköp…' },
  msgExportSession: { fr: '❌ Export échoué (session expirée ?)', en: '❌ Export failed (session expired?)', sv: '❌ Exporten misslyckades (utgången session?)' },
  msgExportKo: { fr: '❌ Export échoué', en: '❌ Export failed', sv: '❌ Exporten misslyckades' },
  msgSyncKo: { fr: '❌ Erreur lors de la synchronisation', en: '❌ Synchronisation failed', sv: '❌ Synkroniseringen misslyckades' },
  msgChamps: { fr: '⚠️ Tous les champs sont requis', en: '⚠️ All fields are required', sv: '⚠️ Alla fält krävs' },
  msgAjoutee: { fr: '✅ Entrée ajoutée', en: '✅ Entry added', sv: '✅ Posten tillagd' },
  msgConfirmDel: { fr: 'Supprimer cette entrée ?', en: 'Delete this entry?', sv: 'Ta bort posten?' },
  msgSupprime: { fr: '🗑️ Supprimé', en: '🗑️ Deleted', sv: '🗑️ Borttagen' },
};

export const entreesImportees = (n: number, lang: string) =>
  lang === 'sv' ? `✅ ${n} nya poster importerade`
  : lang === 'en' ? `✅ ${n} new entries imported`
  : `✅ ${n} nouvelles entrées importées`;
