-- Customer profiles: stores default address and contact info
CREATE TABLE IF NOT EXISTS customer_profiles (
  email        TEXT PRIMARY KEY,
  name         TEXT,
  phone        TEXT,
  address1     TEXT,
  address2     TEXT,
  city         TEXT,
  postal_code  TEXT,
  country      TEXT DEFAULT 'FR',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Allow service role full access (used by the backend)
ALTER TABLE customer_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON customer_profiles FOR ALL TO service_role USING (true) WITH CHECK (true);
