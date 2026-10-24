import { EmailTemplate } from '@/lib/email-templates';

/* Catalogue des gabarits editables et de leurs variables.
   Vit hors de la route : un fichier de route Next ne peut exporter que
   ses handlers, tout autre export fait echouer la compilation. */
export const TEMPLATES: Array<{ key: EmailTemplate; label: string; variables: string[] }> = [
  { key: 'email-confirmation-commande', label: 'Confirmation de commande',
    variables: ['prenom', 'client', 'numero', 'sous_total', 'livraison', 'total', 'adresse_html', 'lignes[].nom', 'lignes[].qte', 'lignes[].pu', 'lignes[].montant'] },
  { key: 'email-facture', label: 'Facture',
    variables: ['prenom', 'client', 'numero', 'numero_facture', 'sous_total', 'livraison', 'total', 'adresse_html', 'lignes[]'] },
  { key: 'email-avoir-remboursement', label: 'Avoir / remboursement',
    variables: ['prenom', 'client', 'numero_avoir', 'numero_facture', 'total', 'lignes[].nom', 'lignes[].qte', 'lignes[].montant', 'lignes[].motif'] },
  { key: 'email-message-libre', label: 'Rupture & remplacement',
    variables: ['prenom', 'numero', 'surtitre', 'titre', 'corps', 'article', 'article_ref', 'article_qte', 'article_pu', 'article_montant', 'base_lien', 'lien_rembourser', 'lien_attendre', 'options[].nom', 'options[].note', 'options[].prix', 'options[].ecart', 'options[].lien'] },
  { key: 'email-expedition', label: 'Expédition', variables: ['prenom', 'numero'] },
  { key: 'email-colis-disponible', label: 'Colis disponible', variables: ['prenom', 'numero'] },
  { key: 'email-livraison', label: 'Livrée — merci & avis Google',
    variables: ['prenom', 'numero', 'atelier', 'relais', 'domicile', 'lien_avis'] },
  { key: 'email-retour-stock', label: 'Retour en stock (alerte)',
    variables: ['produit', 'prix', 'image', 'lien'] },
  { key: 'email-newsletter', label: 'Newsletter de la semaine',
    variables: ['surtitre', 'titre', 'intro', 'preheader', 'bandeau', 'lien_desinscription',
      'promos[].nom', 'promos[].detail', 'promos[].prix_html', 'promos[].image', 'promos[].lien',
      'nouveautes[]', 'retours[]', 'best[]', 'a_promos', 'a_nouveautes', 'a_retours', 'a_best',
      'a_box', 'box_nom', 'box_texte', 'box_image', 'box_prix_html', 'box_lien',
      'a_rituel', 'rituel_titre', 'rituel_texte', 'rituel_lien'] },
  { key: 'email-relance-panier', label: 'Relance panier abandonné',
    variables: ['prenom', 'rang2', 'preheader', 'lignes[].nom', 'lignes[].image', 'lignes[].qte', 'lignes[].pu', 'lignes[].montant', 'sous_total', 'note_livraison', 'offre', 'offre_titre', 'offre_texte', 'offre_code', 'lien_panier', 'lien_desinscription'] },
  { key: 'email-fidelite', label: 'Parrainage validé',
    variables: ['prenom', 'preheader', 'surtitre', 'titre', 'corps', 'code_fidelite', 'fidelite_label', 'fidelite_note', 'cta', 'code_ami', 'ami_texte', 'ami_lien'] },
];

