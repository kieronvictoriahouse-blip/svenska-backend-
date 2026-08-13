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
];

