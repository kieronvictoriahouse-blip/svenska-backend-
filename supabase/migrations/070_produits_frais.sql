/* ═══════════════════════════════════════════════════════════════
   070 — PRODUITS FRAIS : livraison Chronopost Chrono 18 à domicile

   Un produit frais ne part jamais en point relais. Un panier qui en
   contient se livre à domicile en Chronopost Chrono 18 (France), avec
   un supplément de 6,99 € en plus du port normal, ou se retire à
   l'atelier (lib/shipping, /api/checkout).

   La commande correspondante porte delivery_mode = 'domicile_frais'
   (colonne texte libre, rien à migrer côté commandes).

   `pickup_only` garde son sens : produit qui ne s'expédie pas du tout.
   ═══════════════════════════════════════════════════════════════ */

alter table public.products add column if not exists frais boolean not null default false;

comment on column public.products.frais is
  'Produit frais : livraison Chronopost Chrono 18 à domicile (supplément) ou retrait, jamais en point relais.';
