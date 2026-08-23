# 02 — Débranding : séparer le moteur de la marque

Mesuré le 23/08/2026 : **48 fichiers de `src/` portent la marque en
dur** (Swedish Cravings, swedishcravings.fr, le SIREN 105003537,
« EI Victoria Vallet », Marcq-en-Barœul), et les **18 gabarits d'email**
la portent tous. Tant que c'est vrai, chaque instance vendue s'appelle
Swedish Cravings.

Le socle d'accueil existe : `white_label_config` (migration 003 + 007)
porte déjà nom, slogan, couleurs, polices, logo, favicon, coordonnées,
devise, TVA, seuil de franco, SMTP. Le travail n'est pas de créer le
réceptacle — il est de **rapatrier les 48 fichiers vers lui**.

## Inventaire par nature (l'ordre de traitement)

### A. Identité légale du vendeur — le plus sensible

| Où | Quoi | Destination |
|---|---|---|
| `src/lib/invoice-pdf.ts` | `SIREN_RAW = '105003537'`, `EI_NAME`, `RCS_CITY` en secours | `white_label_config` : colonnes `siret`, `legal_name`, `rcs_city` — **sans valeur de secours** : une instance sans SIREN configuré doit REFUSER d'émettre une facture, pas facturer au nom de Victoria |
| `src/app/admin/factures/[id]/page.tsx` | mêmes constantes dupliquées | même traitement, source unique |
| `src/lib/facturx.ts` | `SIREN_FALLBACK` | idem — le XML sans SIREN est invalide, autant échouer clairement |
| `src/lib/invoice-utils.ts` | `'Svenska Delikatessen'` en secours | `site_name` obligatoire au provisionnement |

Règle : **pour l'identité légale, pas de fallback.** Un fallback marque
= des factures émises au nom d'un tiers. C'est le seul endroit du
débranding où l'échec franc est préférable au défaut silencieux.

### B. URLs et adresses email (≈15 fichiers)

`hej@swedishcravings.fr` (boîte mail, documents, ruptures),
`www.swedishcravings.fr` (home-cms, payment-link, emails), domaines
autorisés du rehost d'images. → colonnes `contact_email`, `front_url`
(existent déjà en partie) ; l'IMAP est déjà en env, retirer l'affichage
en dur dans `boite-mail/page.tsx`.

### C. Les 18 gabarits d'email

Tous parlent de « notre atelier de Marcq-en-Barœul », de Mondial Relay,
signent Swedish Cravings. Ils sont générés depuis le français par
`scripts/gabarits-traduits.js` — le débranding se fait donc **dans les
sources FR uniquement**, en variables `{{shop_name}}`, `{{shop_city}}`,
`{{carrier_name}}`, `{{front_url}}`, résolues par le moteur d'envoi
comme les variables existantes. Puis régénérer EN/SV (le script refuse
déjà tout français résiduel — il jouera le rôle de filet).

### D. Textes d'interface admin (≈12 fichiers)

Mentions cosmétiques (placeholders, exemples, titres). Sans risque —
mais c'est ce que le prospect voit en démo. Passer par `useT()` ou par
`white_label_config` selon le cas.

### E. Spécifique métier à NE PAS débrander

- Le calcul TNT/GEKAS/WILLYS du moteur d'achats : ce sont les
  FOURNISSEURS du client, données en base (`contacts`), pas de la
  marque. Vérifier seulement qu'aucun nom n'est en dur dans le code.
- `snipcart/*` et `replay-orders` : reliquats de l'ancienne pile —
  candidats à la suppression pure plutôt qu'au débranding.

## La méthode

1. Écrire `scripts/audit-marque.js` D'ABORD (même famille que
   audit-stock / audit-facturation) : greppe les motifs (noms, SIREN,
   domaines, ville) dans `src/` et `src/emails/templates/`, sort la
   liste, code retour ≠ 0 si occurrence. **C'est le critère de sortie
   et le garde-fou permanent** — il tournera en CI pour empêcher toute
   réintroduction.
2. Traiter A (légal) puis C (emails) puis B puis D — dans cet ordre de
   risque.
3. Chaque lot : build vert + les deux audits existants verts +
   `audit-marque.js` qui décroît jusqu'à zéro.
4. L'instance Swedish Cravings devient la PREMIÈRE instance du produit :
   sa config white-label porte sa marque, le moteur n'en porte plus.

## Critère de sortie

```bash
node scripts/audit-marque.js   # → zéro occurrence, code retour 0
```

Et une preuve visuelle : la même build déployée avec une config
white-label fictive (« Fromagerie Dupont ») n'affiche nulle part
Swedish Cravings — écrans, PDF de facture, email de confirmation.

Effort : 2-3 jours. Aucune dépendance externe.
