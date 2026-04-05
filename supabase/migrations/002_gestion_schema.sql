-- ═══════════════════════════════════════════════════════════════
-- SVENSKA DELIKATESSEN — Migration 002
-- Tables pour Svenska Gestion (facturation, achats, marges)
-- À coller dans Supabase > SQL Editor > Run
-- APRÈS avoir exécuté la migration 001
-- ═══════════════════════════════════════════════════════════════

-- ─── CLIENTS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clients (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         TEXT NOT NULL,
  email        TEXT,
  phone        TEXT,
  address      TEXT,
  company      TEXT,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ─── FACTURES CLIENTS ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoices (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  number        TEXT UNIQUE NOT NULL,        -- SD-0001
  date          DATE NOT NULL,
  due_date      DATE,
  status        TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft','sent','paid','late','cancelled')),
  client_id     UUID REFERENCES clients(id) ON DELETE SET NULL,
  client_name   TEXT NOT NULL,               -- dénormalisé pour facilité
  client_email  TEXT,
  client_address TEXT,
  lines         JSONB NOT NULL DEFAULT '[]', -- [{desc,qty,price,tva}]
  total_ht      NUMERIC(10,2) DEFAULT 0,
  total_tva     NUMERIC(10,2) DEFAULT 0,
  total_ttc     NUMERIC(10,2) DEFAULT 0,
  note          TEXT,
  paid_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── FOURNISSEURS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS suppliers (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         TEXT NOT NULL,
  country      TEXT DEFAULT 'Suède',
  email        TEXT,
  phone        TEXT,
  address      TEXT,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ─── ACHATS FOURNISSEURS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchases (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_id   UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  supplier_name TEXT NOT NULL,               -- dénormalisé
  ref           TEXT,                        -- n° facture fournisseur
  date          DATE NOT NULL,
  status        TEXT NOT NULL DEFAULT 'received'
                CHECK (status IN ('received','pending','paid')),
  amount_ht     NUMERIC(10,2) DEFAULT 0,
  transport     NUMERIC(10,2) DEFAULT 0,
  total         NUMERIC(10,2) DEFAULT 0,
  products_desc TEXT,                        -- liste textuelle des produits
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── PRODUITS AVEC MARGES ───────────────────────────────────────
-- Table séparée de `products` — orientée gestion financière
CREATE TABLE IF NOT EXISTS margin_products (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id    UUID REFERENCES products(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  category      TEXT,
  buy_price     NUMERIC(10,4) NOT NULL,      -- prix achat fournisseur HT
  transport_pu  NUMERIC(10,4) DEFAULT 0,     -- transport par unité
  other_costs   NUMERIC(10,4) DEFAULT 0,     -- douane, emballage…
  cost_price    NUMERIC(10,4) GENERATED ALWAYS AS (buy_price + transport_pu + other_costs) STORED,
  sell_price    NUMERIC(10,4) NOT NULL,      -- prix vente HT
  margin_eur    NUMERIC(10,4) GENERATED ALWAYS AS (sell_price - (buy_price + transport_pu + other_costs)) STORED,
  margin_pct    NUMERIC(6,2)  GENERATED ALWAYS AS (
    CASE WHEN sell_price > 0
    THEN ((sell_price - (buy_price + transport_pu + other_costs)) / sell_price) * 100
    ELSE 0 END
  ) STORED,
  stock_qty     INTEGER DEFAULT 0,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── LIVRAISONS / TRANSPORT ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS shipments (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ref           TEXT,                        -- LIV-2026-001
  supplier_name TEXT,
  date          DATE,
  total_cost    NUMERIC(10,2) NOT NULL,
  method        TEXT DEFAULT 'weight'
                CHECK (method IN ('weight','value','equal')),
  lines         JSONB NOT NULL DEFAULT '[]', -- [{name,weight,value,qty,per_unit}]
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── PARAMÈTRES SOCIÉTÉ ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS company_settings (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key             TEXT UNIQUE NOT NULL,
  value           TEXT,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Seed settings par défaut
INSERT INTO company_settings (key, value) VALUES
  ('company_name',     'Svenska Delikatessen'),
  ('legal_form',       'Auto-entrepreneur'),
  ('siret',            ''),
  ('tva_number',       ''),
  ('address',          ''),
  ('email',            'hej@svenska-delikatessen.com'),
  ('phone',            ''),
  ('website',          'svenska-delikatessen.fr'),
  ('tva_rate',         '20'),
  ('payment_days',     '30'),
  ('legal_mention',    'TVA non applicable - article 293B du CGI'),
  ('iban',             ''),
  ('invoice_prefix',   'SD-'),
  ('invoice_next',     '1'),
  ('margin_target',    '40')
ON CONFLICT (key) DO NOTHING;

-- ─── TRIGGERS ───────────────────────────────────────────────────
CREATE TRIGGER invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER margin_products_updated_at
  BEFORE UPDATE ON margin_products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── ROW LEVEL SECURITY ─────────────────────────────────────────
ALTER TABLE clients          ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices         ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases        ENABLE ROW LEVEL SECURITY;
ALTER TABLE margin_products  ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;

-- Accès admin uniquement (authenticated) — pas de lecture publique
CREATE POLICY "admin_clients"    ON clients          FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "admin_invoices"   ON invoices         FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "admin_suppliers"  ON suppliers        FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "admin_purchases"  ON purchases        FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "admin_margins"    ON margin_products  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "admin_shipments"  ON shipments        FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "admin_settings"   ON company_settings FOR ALL USING (auth.role() = 'authenticated');

-- ─── VUES UTILES ────────────────────────────────────────────────

-- Vue dashboard : CA et factures par mois
CREATE OR REPLACE VIEW v_monthly_revenue AS
SELECT
  DATE_TRUNC('month', date) AS month,
  COUNT(*)                   AS invoice_count,
  SUM(total_ht)              AS total_ht,
  SUM(total_ttc)             AS total_ttc,
  SUM(CASE WHEN status = 'paid'  THEN total_ttc ELSE 0 END) AS paid_ttc,
  SUM(CASE WHEN status IN ('sent','late') THEN total_ttc ELSE 0 END) AS pending_ttc
FROM invoices
WHERE status != 'draft'
GROUP BY 1
ORDER BY 1 DESC;

-- Vue : produits sous le seuil de marge cible
CREATE OR REPLACE VIEW v_low_margin_products AS
SELECT
  mp.*,
  p.image_url,
  p.price AS public_price
FROM margin_products mp
LEFT JOIN products p ON p.id = mp.product_id
WHERE mp.margin_pct < 40
ORDER BY mp.margin_pct ASC;

-- ═══════════════════════════════════════════════════════════════
-- API ROUTES À AJOUTER dans le back-end Next.js
-- (voir section API dans le BRIEFING)
-- ═══════════════════════════════════════════════════════════════
-- GET/POST  /api/invoices
-- GET/PUT/DELETE /api/invoices/[id]
-- GET/POST  /api/purchases
-- GET/POST  /api/margin-products
-- GET/PUT   /api/settings
-- POST      /api/invoices/[id]/pdf  (génération PDF serveur)
