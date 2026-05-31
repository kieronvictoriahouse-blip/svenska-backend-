ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS logspher_shipment_id   INTEGER,
  ADD COLUMN IF NOT EXISTS logspher_tracking       TEXT,
  ADD COLUMN IF NOT EXISTS logspher_label_url      TEXT,
  ADD COLUMN IF NOT EXISTS logspher_carrier_name   TEXT,
  ADD COLUMN IF NOT EXISTS logspher_carrier_code   TEXT,
  ADD COLUMN IF NOT EXISTS logspher_error          TEXT;
