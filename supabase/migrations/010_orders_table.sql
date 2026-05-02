-- ═══════════════════════════════════════════════════════════════
-- SVENSKA DELIKATESSEN — Migration 010
-- Table des commandes + fonction décrémentation stock
-- ═══════════════════════════════════════════════════════════════

-- ─── ORDERS ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number     TEXT UNIQUE NOT NULL,
  snipcart_token   TEXT UNIQUE,                  -- token unique Snipcart
  snipcart_invoice TEXT,                         -- numéro facture Snipcart
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','paid','shipped','delivered','cancelled','refunded')),

  -- Client
  customer_name    TEXT,
  customer_email   TEXT,

  -- Adresses (JSONB)
  shipping_address JSONB DEFAULT '{}',
  billing_address  JSONB DEFAULT '{}',

  -- Lignes (JSONB) : [{id, name, qty, price, variant}]
  lines            JSONB NOT NULL DEFAULT '[]',

  -- Montants
  subtotal         NUMERIC(10,2) DEFAULT 0,
  shipping         NUMERIC(10,2) DEFAULT 0,
  total            NUMERIC(10,2) DEFAULT 0,

  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── RLS ────────────────────────────────────────────────────────
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Service role (webhook) peut tout faire sans RLS
-- Admin authentifié peut tout lire/modifier
CREATE POLICY "admin_all_orders"
  ON orders FOR ALL
  USING (auth.role() = 'authenticated');

-- ─── DECREMENT STOCK ────────────────────────────────────────────
-- Décrémente margin_products.stock_qty via product_id (UUID)
-- SECURITY DEFINER pour que le webhook (service role) puisse l'appeler
CREATE OR REPLACE FUNCTION decrement_stock(p_id UUID, qty INTEGER)
RETURNS VOID AS $$
BEGIN
  UPDATE margin_products
  SET stock_qty = GREATEST(0, stock_qty - qty),
      updated_at = NOW()
  WHERE product_id = p_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── INDEX ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS orders_status_idx        ON orders(status);
CREATE INDEX IF NOT EXISTS orders_email_idx         ON orders(customer_email);
CREATE INDEX IF NOT EXISTS orders_snipcart_token_idx ON orders(snipcart_token);
CREATE INDEX IF NOT EXISTS orders_created_at_idx    ON orders(created_at DESC);
