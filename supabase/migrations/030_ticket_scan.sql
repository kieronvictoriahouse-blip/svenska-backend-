-- ═══════════════════════════════════════════════════════════════
-- Migration 030 — Saisie ticket de caisse + scan code-barres
-- Handoff « scan & saisie ticket ». Trois besoins :
--   1. identifier un produit par son EAN (scan) ;
--   2. mémoriser la correspondance libellé de ticket → produit ;
--   3. tracer les écarts d'inventaire et archiver les tickets.
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. EAN sur les produits ────────────────────────────────────
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS ean TEXT;

-- Unicité, mais uniquement sur les valeurs renseignées : la plupart
-- des produits n'ont pas encore de code-barres.
CREATE UNIQUE INDEX IF NOT EXISTS products_ean_unique
  ON products (ean) WHERE ean IS NOT NULL AND ean <> '';

COMMENT ON COLUMN products.ean IS 'Code-barres EAN-13, scanné en magasin';

-- ─── 2. Alias de libellés de ticket ─────────────────────────────
-- « V-BOTTENSOST » chez ICA Maxi → Västerbottensost 300 g.
-- Alimentée à chaque validation manuelle d'une ligne de ticket.
CREATE TABLE IF NOT EXISTS ticket_aliases (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  raw_label   TEXT NOT NULL,
  store       TEXT,
  product_id  UUID REFERENCES products(id) ON DELETE CASCADE,
  hits        INTEGER DEFAULT 1,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Un libellé peut désigner un produit différent selon le magasin.
CREATE UNIQUE INDEX IF NOT EXISTS ticket_aliases_label_store
  ON ticket_aliases (lower(raw_label), coalesce(store, ''));

ALTER TABLE ticket_aliases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_ticket_aliases" ON ticket_aliases;
CREATE POLICY "admin_ticket_aliases" ON ticket_aliases FOR ALL USING (auth.role() = 'authenticated');

-- ─── 3. Tickets de caisse archivés ──────────────────────────────
-- La photo est un justificatif comptable : on garde l'URL de stockage,
-- le total lu par l'OCR et les lignes telles que validées.
CREATE TABLE IF NOT EXISTS purchase_tickets (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store             TEXT,
  purchased_at      DATE,
  currency          TEXT DEFAULT 'SEK',
  exchange_rate     NUMERIC(12,6),
  vat_rate          NUMERIC(5,2) DEFAULT 12,
  total_ocr         NUMERIC(12,2),
  total_lines       NUMERIC(12,2),
  goods_eur_ht      NUMERIC(12,2),
  image_urls        JSONB DEFAULT '[]'::jsonb,
  lines             JSONB DEFAULT '[]'::jsonb,
  purchase_order_id UUID,
  reception_id      UUID,
  status            TEXT DEFAULT 'draft',
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE purchase_tickets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_purchase_tickets" ON purchase_tickets;
CREATE POLICY "admin_purchase_tickets" ON purchase_tickets FOR ALL USING (auth.role() = 'authenticated');

-- ─── 4. Mouvements de stock ─────────────────────────────────────
-- Les écarts d'inventaire doivent être datés et traçables, pas
-- écrasés silencieusement dans products.stock.
CREATE TABLE IF NOT EXISTS stock_movements (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id  UUID REFERENCES products(id) ON DELETE CASCADE,
  delta       INTEGER NOT NULL,
  qty_before  INTEGER,
  qty_after   INTEGER,
  reason      TEXT NOT NULL DEFAULT 'inventory',  -- inventory | reception | order | manual | picking
  reference   TEXT,
  note        TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS stock_movements_product ON stock_movements (product_id, created_at DESC);

ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_stock_movements" ON stock_movements;
CREATE POLICY "admin_stock_movements" ON stock_movements FOR ALL USING (auth.role() = 'authenticated');

-- ─── 5. Préparation de commande ─────────────────────────────────
-- Avancement du picking, pour reprendre une préparation interrompue.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS picking JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS picked_at TIMESTAMPTZ;

COMMENT ON COLUMN orders.picking IS 'Quantités déjà scannées par product_id';
