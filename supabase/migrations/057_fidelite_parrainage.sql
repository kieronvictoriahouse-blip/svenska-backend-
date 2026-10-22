/* ═══════════════════════════════════════════════════════════════
   057 — FIDÉLITÉ & PARRAINAGE

   Deux codes personnels par client, rangés dans promo_codes pour
   profiter de toute la chaîne existante (panier, checkout, coupon
   Stripe, back-office) :

   · « parrainage » — le code ami, à partager. Créé à la 1re commande
     payée. −5 % sur la 1re commande d'un nouveau client.
   · « fidelite »   — personnel, utilisable seulement avec l'email de
     son propriétaire. Créé à la 3e commande payée. −5 %, porté à
     −10 % pendant 12 mois après chaque parrainage validé.

   Les règles chiffrées vivent dans src/lib/fidelite-regles.ts ; le
   taux n'est jamais stocké, il se déduit des parrainages validés.
   ═══════════════════════════════════════════════════════════════ */

ALTER TABLE promo_codes
  ADD COLUMN IF NOT EXISTS kind TEXT CHECK (kind IN ('fidelite', 'parrainage')),
  ADD COLUMN IF NOT EXISTS owner_email TEXT;

-- Un code de chaque sorte par client, quelle que soit la casse de l'email.
CREATE UNIQUE INDEX IF NOT EXISTS promo_codes_un_par_client
  ON promo_codes (lower(owner_email), kind) WHERE kind IS NOT NULL;

CREATE TABLE IF NOT EXISTS referrals (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_email TEXT NOT NULL,
  referee_email  TEXT NOT NULL,
  order_id       UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  promo_code_id  UUID REFERENCES promo_codes(id) ON DELETE SET NULL,
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'validated', 'cancelled')),
  cancel_reason  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  validated_at   TIMESTAMPTZ
);

-- On n'est parrainé qu'une fois : c'est la 1re commande qui compte.
CREATE UNIQUE INDEX IF NOT EXISTS referrals_un_filleul ON referrals (lower(referee_email));
CREATE INDEX IF NOT EXISTS referrals_parrain ON referrals (lower(referrer_email));
CREATE INDEX IF NOT EXISTS referrals_a_valider ON referrals (status, created_at);

-- Clé de service uniquement (elle contourne RLS) : aucune règle.
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

/* « Public promo check » laissait la clé anonyme, publique, lister
   tous les codes actifs. Le panier n'en a plus besoin depuis
   /api/promo/validate, et les codes personnels portent l'email de
   leur propriétaire. */
DROP POLICY IF EXISTS "Public promo check" ON promo_codes;
