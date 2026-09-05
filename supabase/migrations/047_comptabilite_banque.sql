-- ═══════════════════════════════════════════════════════════════════════
--  Migration 047 — Comptabilité : banque, rapprochement, pile de tri, clôture
--  Socle de la refonte du module Finance (handoff « brique Finance »).
--
--  Modèle : comptabilité d'ENCAISSEMENT (micro-entreprise). La table
--  `accounting_entries` reste le journal de trésorerie ; on lui ajoute les
--  colonnes qui permettent d'afficher un journal débit/crédit, de rattacher
--  un justificatif et de lier une écriture à sa ligne bancaire.
--
--  Nouvelles tables :
--    bank_connections   — une connexion agrégateur (GoCardless), import ou Stripe
--    bank_accounts      — les comptes rattachés à une connexion
--    bank_transactions  — les lignes de relevé (brutes), avec proposition + rapprochement
--    reconciliations    — le rapprochement mensuel signé et horodaté
--    accounting_rules   — moteur de catégorisation + apprentissage des corrections
--    accounting_periods — clôture / verrouillage mensuel (fige le stock)
--
--  Idempotent : ré-exécutable sans casse (IF NOT EXISTS / DROP POLICY IF EXISTS).
--  À exécuter dans Supabase → SQL Editor.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Extension de accounting_entries ────────────────────────────────
ALTER TABLE accounting_entries
  ADD COLUMN IF NOT EXISTS account_code        TEXT,          -- compte PCG du poste (607, 706…)
  ADD COLUMN IF NOT EXISTS counterparty_account TEXT,         -- compte de contrepartie (512, 401, 411…)
  ADD COLUMN IF NOT EXISTS journal             TEXT,          -- VE / AC / BQ / OD
  ADD COLUMN IF NOT EXISTS piece               TEXT,          -- n° de pièce (facture, ticket, PO…)
  ADD COLUMN IF NOT EXISTS receipt_url         TEXT,          -- justificatif (storage) — NULL = manquant
  ADD COLUMN IF NOT EXISTS bank_transaction_id UUID,          -- ligne bancaire rapprochée
  ADD COLUMN IF NOT EXISTS reconciled          BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_personal         BOOLEAN NOT NULL DEFAULT FALSE, -- prélèvement perso : hors CA/charges
  ADD COLUMN IF NOT EXISTS source              TEXT,          -- bank | order | reception | landed_cost | refund | manual | stripe
  ADD COLUMN IF NOT EXISTS confidence          INT,           -- score de la proposition acceptée (0-100)
  ADD COLUMN IF NOT EXISTS sorted_at           TIMESTAMPTZ,   -- date de rangement dans la pile de tri
  ADD COLUMN IF NOT EXISTS period              TEXT;          -- YYYY-MM, pour la clôture

CREATE INDEX IF NOT EXISTS idx_accounting_period   ON accounting_entries (period);
CREATE INDEX IF NOT EXISTS idx_accounting_banktx   ON accounting_entries (bank_transaction_id);

-- ── 2. bank_connections ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bank_connections (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider           TEXT NOT NULL DEFAULT 'gocardless'  -- gocardless | stripe | import | manual
                     CHECK (provider IN ('gocardless','stripe','import','manual')),
  status             TEXT NOT NULL DEFAULT 'pending'     -- pending | linked | active | expired | error | revoked
                     CHECK (status IN ('pending','linked','active','expired','error','revoked')),
  institution_id     TEXT,                               -- id GoCardless de la banque (ex: BNP_FR…)
  institution_name   TEXT,
  institution_logo   TEXT,
  requisition_id     TEXT,                               -- id de la requisition GoCardless
  reference          TEXT,                               -- notre référence envoyée à l'agrégateur
  access_valid_until TIMESTAMPTZ,                        -- fin de validité de l'accès PSD2 (~90 j)
  last_sync_at       TIMESTAMPTZ,
  error_message      TEXT,
  meta               JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 3. bank_accounts ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bank_accounts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID REFERENCES bank_connections(id) ON DELETE CASCADE,
  provider      TEXT NOT NULL DEFAULT 'gocardless',
  external_id   TEXT NOT NULL,                           -- id du compte chez l'agrégateur / 'stripe' / 'manual'
  name          TEXT,                                    -- libellé affiché (« Compte professionnel »)
  short_code    TEXT,                                    -- pastille 2 lettres (« CP », « ST »)
  iban          TEXT,                                    -- masqué en base (FR76 •••• 7890)
  currency      TEXT NOT NULL DEFAULT 'EUR',
  holder_name   TEXT,
  pcg_account   TEXT NOT NULL DEFAULT '512000',          -- compte de trésorerie (512 Banque)
  balance       NUMERIC(12,2),                           -- solde le plus récent renvoyé par la banque
  balance_at    TIMESTAMPTZ,
  is_primary    BOOLEAN NOT NULL DEFAULT FALSE,
  status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','expired','error','revoked')),
  meta          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_bank_account_ext ON bank_accounts (provider, external_id);
CREATE INDEX IF NOT EXISTS idx_bank_account_conn ON bank_accounts (connection_id);

-- ── 4. bank_transactions ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bank_transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID REFERENCES bank_accounts(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL DEFAULT 'gocardless',
  external_id     TEXT NOT NULL,                         -- transactionId de l'agrégateur (clé de déduplication)
  booking_date    DATE NOT NULL,
  value_date      DATE,
  amount          NUMERIC(12,2) NOT NULL,                -- signé : + entrée, − sortie
  currency        TEXT NOT NULL DEFAULT 'EUR',
  direction       TEXT NOT NULL DEFAULT 'out'            -- in | out (dérivé du signe)
                  CHECK (direction IN ('in','out')),
  label           TEXT,                                  -- libellé brut (remittanceInformation)
  counterparty    TEXT,                                  -- nom du tiers si fourni
  status          TEXT NOT NULL DEFAULT 'booked'         -- booked | pending
                  CHECK (status IN ('booked','pending')),
  -- proposition de catégorisation / rapprochement
  category        TEXT,                                  -- catégorie proposée ou assignée (clé interne)
  account_code    TEXT,                                  -- compte PCG proposé
  confidence      INT,                                   -- 0-100
  match_kind      TEXT,                                  -- match | split | create | manual
  match_hint      TEXT,                                  -- phrase « pourquoi »
  matched_entry_id UUID REFERENCES accounting_entries(id) ON DELETE SET NULL,
  -- état
  reconciled      BOOLEAN NOT NULL DEFAULT FALSE,
  reconciled_at   TIMESTAMPTZ,
  reconciled_by   TEXT,
  ignored         BOOLEAN NOT NULL DEFAULT FALSE,        -- « mis de côté pour le comptable »
  is_personal     BOOLEAN NOT NULL DEFAULT FALSE,
  -- split Stripe (versement groupé)
  is_split_parent BOOLEAN NOT NULL DEFAULT FALSE,        -- le payout Stripe, décomposé en enfants
  split_parent_id UUID REFERENCES bank_transactions(id) ON DELETE SET NULL,
  -- justificatif
  receipt_url     TEXT,
  period          TEXT,                                  -- YYYY-MM (booking_date)
  raw             JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_bank_tx_ext  ON bank_transactions (provider, external_id);
CREATE INDEX IF NOT EXISTS idx_bank_tx_account      ON bank_transactions (account_id);
CREATE INDEX IF NOT EXISTS idx_bank_tx_period       ON bank_transactions (period);
CREATE INDEX IF NOT EXISTS idx_bank_tx_reconciled   ON bank_transactions (reconciled) WHERE reconciled = FALSE;
CREATE INDEX IF NOT EXISTS idx_bank_tx_split_parent ON bank_transactions (split_parent_id);

-- lien retour depuis l'écriture vers la ligne bancaire (posé après création de la table)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'accounting_entries_bank_tx_fk'
  ) THEN
    ALTER TABLE accounting_entries
      ADD CONSTRAINT accounting_entries_bank_tx_fk
      FOREIGN KEY (bank_transaction_id) REFERENCES bank_transactions(id) ON DELETE SET NULL;
  END IF;
END$$;

-- ── 5. reconciliations (rapprochement mensuel signé) ──────────────────
CREATE TABLE IF NOT EXISTS reconciliations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period            TEXT NOT NULL,                        -- YYYY-MM
  account_id        UUID REFERENCES bank_accounts(id) ON DELETE SET NULL, -- NULL = tous comptes
  statement_balance NUMERIC(12,2),                        -- ce que dit la banque
  book_balance      NUMERIC(12,2),                        -- ce que dit la compta (512)
  gap               NUMERIC(12,2),                        -- écart (doit = somme des opérations en transit)
  pending           JSONB NOT NULL DEFAULT '[]'::jsonb,   -- opérations en transit qui expliquent l'écart
  status            TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','signed')),
  signed_at         TIMESTAMPTZ,
  signed_by         TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_reconciliation_period ON reconciliations (period, COALESCE(account_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- ── 6. accounting_rules (catégorisation + apprentissage) ──────────────
CREATE TABLE IF NOT EXISTS accounting_rules (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_type   TEXT NOT NULL DEFAULT 'label_contains'    -- label_contains | counterparty | amount | regex
               CHECK (match_type IN ('label_contains','counterparty','amount','regex')),
  pattern      TEXT NOT NULL,                             -- motif à rechercher (insensible à la casse)
  direction    TEXT CHECK (direction IN ('in','out')),   -- NULL = les deux sens
  category     TEXT NOT NULL,                             -- catégorie interne cible
  account_code TEXT,                                      -- compte PCG
  is_personal  BOOLEAN NOT NULL DEFAULT FALSE,
  priority     INT NOT NULL DEFAULT 0,                    -- plus haut = prioritaire
  hits         INT NOT NULL DEFAULT 0,                    -- nb de fois appliquée (apprentissage)
  source       TEXT NOT NULL DEFAULT 'learned'            -- seed | manual | learned
               CHECK (source IN ('seed','manual','learned')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rules_priority ON accounting_rules (priority DESC);

-- ── 7. accounting_periods (clôture mensuelle) ─────────────────────────
CREATE TABLE IF NOT EXISTS accounting_periods (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period      TEXT NOT NULL UNIQUE,                       -- YYYY-MM
  status      TEXT NOT NULL DEFAULT 'open'
              CHECK (status IN ('open','closed')),
  closed_at   TIMESTAMPTZ,
  closed_by   TEXT,
  stock_value NUMERIC(12,2),                              -- valeur du stock figée à la clôture
  meta        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 8. RLS (aligné sur le reste du back-office : rôle authentifié) ─────
--   Le service-role (API routes) contourne la RLS ; ces règles protègent
--   les accès via clé anon.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['bank_connections','bank_accounts','bank_transactions','reconciliations','accounting_rules','accounting_periods']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS "admin_all" ON %I;', t);
    EXECUTE format('CREATE POLICY "admin_all" ON %I FOR ALL USING (auth.role() = ''authenticated'');', t);
  END LOOP;
END$$;

-- ── 9. Règles de catégorisation initiales (les contreparties connues) ─
--   Elles amorcent la pile de tri ; chaque correction humaine en ajoutera.
INSERT INTO accounting_rules (match_type, pattern, direction, category, account_code, is_personal, priority, source)
VALUES
  ('label_contains', 'STRIPE',        'in',  'vente',     '706000', FALSE, 90, 'seed'),
  ('label_contains', 'MONDIAL RELAY', 'out', 'transport', '624100', FALSE, 80, 'seed'),
  ('label_contains', 'MR-',           'out', 'transport', '624100', FALSE, 70, 'seed'),
  ('label_contains', 'GLS',           'out', 'transport', '624100', FALSE, 80, 'seed'),
  ('label_contains', 'COLISSIMO',     'out', 'transport', '624100', FALSE, 80, 'seed'),
  ('label_contains', 'CHRONOPOST',    'out', 'transport', '624100', FALSE, 80, 'seed'),
  ('label_contains', 'OVH',           'out', 'logiciel',  '651600', FALSE, 80, 'seed'),
  ('label_contains', 'HEBERGEMENT',   'out', 'logiciel',  '651600', FALSE, 60, 'seed'),
  ('label_contains', 'VERCEL',        'out', 'logiciel',  '651600', FALSE, 80, 'seed'),
  ('label_contains', 'GOOGLE',        'out', 'logiciel',  '651600', FALSE, 60, 'seed'),
  ('label_contains', 'COMMISSION SEPA','out','banque',    '627000', FALSE, 90, 'seed'),
  ('label_contains', 'FRAIS',         'out', 'banque',    '627000', FALSE, 40, 'seed'),
  ('label_contains', 'TENUE DE COMPTE','out','banque',    '627000', FALSE, 90, 'seed'),
  ('label_contains', 'CARREFOUR',     'out', 'march',     '607000', FALSE, 50, 'seed'),
  ('label_contains', 'CARBURANT',     'out', 'depl',      '625100', FALSE, 70, 'seed'),
  ('label_contains', 'TOTAL',         'out', 'depl',      '625100', FALSE, 40, 'seed'),
  ('label_contains', 'SVENSK',        'out', 'march',     '607000', FALSE, 85, 'seed')
ON CONFLICT DO NOTHING;

-- ── 10. Trigger updated_at (réutilise la fonction si elle existe) ──────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at') THEN
    CREATE FUNCTION set_updated_at() RETURNS TRIGGER AS $f$
    BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
    $f$ LANGUAGE plpgsql;
  END IF;
END$$;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['bank_connections','bank_accounts','bank_transactions','reconciliations','accounting_rules']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated ON %I;', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_updated BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at();', t, t);
  END LOOP;
END$$;

-- Fin migration 047.
