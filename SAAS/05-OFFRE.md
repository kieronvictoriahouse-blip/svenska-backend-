# 05 — Offre, prix, cible

## La cible de lancement : les micro-entrepreneurs e-commerce français

Choix assumé, dicté par le code : tout le moteur de facturation suppose
la **franchise en base de TVA** (art. 293 B — HT = TTC, catégorie E dans
le Factur-X, mentions dédiées). C'est une limite ET une force :

- une niche réelle et nombreuse (vendeurs de produits importés,
  créateurs, épiceries spécialisées — exactement ton profil) ;
- un argument que personne ne leur sert : **« conforme facturation
  électronique 2026/2027, factures inaltérables, livre des recettes en
  un clic »** — leurs obligations exactes, pas celles des grandes
  entreprises ;
- une histoire vraie : le logiciel fait tourner une vraie boutique,
  la tienne, tous les jours. Tu es la démo.

Le régime TVA normale (taux par ligne, catégorie S, déclarations CA3)
est LE chantier qui ouvre le marché au-dessus — à faire quand un
prospect payant le demande, pas avant.

## L'offre

| | **Essentiel** | **Boutique** | **Boutique+** |
|---|---|---|---|
| Prix | 79 €/mois | 129 €/mois | 179 €/mois |
| Vitrine trilingue FR/EN/SV | ● | ● | ● |
| Back-office complet (32 écrans) | ● | ● | ● |
| Factures Factur-X inaltérables, livre des recettes | ● | ● | ● |
| Stock tracé + audits | ● | ● | ● |
| Préparation au scan, ruptures avec choix client | — | ● | ● |
| Moteur d'achats (couverture, franco, conditionnements) | — | ● | ● |
| Boîte mail intégrée, campagnes, automations | — | — | ● |
| Domaine propre | option | ● | ● |
| Mise en route accompagnée (1 h en visio) | option 149 € | incluse | incluse |

- **Frais d'installation : 0 €** — le robot la rend gratuite, et c'est
  un différenciateur face aux prestataires à devis.
- Essai 14 jours. Engagement mensuel, résiliable, **export complet
  garanti** (c'est dans le contrat, et le logiciel sait déjà le faire).
- Le différentiel Essentiel/Boutique est un partitionnement d'écrans
  existants (la navigation est déjà pilotée par `admin-nav.ts`, source
  unique) — pas de développement, un drapeau de gamme dans la config.

## L'économie

| Par instance/mois | bas | haut |
|---|---|---|
| Supabase | 0 (free) | 25 $ (Pro) |
| Vercel | 0 (hobby interdit en commercial → Pro mutualisé) | ~20 $ au prorata |
| Resend, divers | 0 | ~5 € |
| **Coût total** | **~5 €** | **~45 €** |

Marge brute 65-95 % selon le palier — saine dès le premier abonné.
Point mort de l'effort (phases 1-3 ≈ 5-6 semaines de travail) :
**~10 abonnés Boutique**.

Seuil d'attention : ton propre statut de micro-entrepreneur — les
abonnements Shopflow s'ajoutent au CA de la boutique. Le plafond
micro-BIC se rapproche vite avec 20 abonnés à 129 € (~31 k€/an de CA en
plus). **En parler au comptable AVANT le premier abonné payant** :
c'est peut-être la naissance d'une société dédiée.

## L'argumentaire en trois phrases (pour la page de vente)

1. *Votre boutique complète — vitrine et gestion — tenue par un
   logiciel qui fait déjà tourner une vraie épicerie en ligne tous les
   jours.*
2. *Conforme aux obligations 2026/2027 des micro-entrepreneurs :
   factures électroniques Factur-X, pièces inaltérables, livre des
   recettes en un clic.*
3. *Vos données dans votre propre base, exportables intégralement le
   jour où vous partez — nous ne prenons pas vos clients en otage.*

## Le pilote (phase 4)

Un commerçant réel, de préférence connu, qui passe par le tunnel
complet en payant (même à tarif pilote −50 % à vie). Objectifs mesurés :
provisionnement sans intervention, onboarding Stripe/Resend fait par lui
seul en moins d'une journée, première vente réelle encaissée, premier
mois sans ticket bloquant. **Tant que ce n'est pas atteint, on ne fait
pas de marketing** — chaque défaut trouvé par le pilote coûte dix fois
moins que trouvé par dix clients.
