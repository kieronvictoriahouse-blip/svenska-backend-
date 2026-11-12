-- ═══════════════════════════════════════════════════════════════
-- Migration 069 — Paniers en cours (vue en direct)
--
-- Le panier vit dans le navigateur du client jusqu'au paiement : le
-- back-office ne voyait rien avant le clic sur « Payer ». Le site envoie
-- désormais un instantané anonyme à chaque changement (identifiant
-- aléatoire du navigateur, articles, total, page vue). Aucune donnée
-- personnelle : ni nom, ni e-mail, ni adresse IP stockée.
--
-- order_id relie le panier à sa commande quand le client passe au
-- paiement (route /api/checkout). Les lignes de plus de 7 jours sont
-- purgées à la lecture par /api/admin/paniers.
-- Accès : clé de service uniquement (RLS active, aucune policy).
-- ═══════════════════════════════════════════════════════════════

create table if not exists live_carts (
  sid         text primary key,
  items       jsonb not null default '[]'::jsonb,
  nb          integer not null default 0,
  total       numeric(10, 2) not null default 0,
  page        text,
  lang        text,
  mobile      boolean,
  order_id    uuid references orders(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists live_carts_updated_idx on live_carts (updated_at desc);

alter table live_carts enable row level security;
