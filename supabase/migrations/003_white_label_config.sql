-- White-label configuration table
CREATE TABLE IF NOT EXISTS white_label_config (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_name       text NOT NULL DEFAULT 'Heather & Lingon',
  site_slogan     text DEFAULT 'British & Nordic Pantry',
  logo_url        text DEFAULT '',
  favicon_url     text DEFAULT '',
  color_primary   text DEFAULT '#7B4F7B',
  color_secondary text DEFAULT '#8B2E3C',
  color_bg        text DEFAULT '#F6F1E9',
  color_text      text DEFAULT '#1C2028',
  font_display    text DEFAULT 'Cormorant Garamond',
  font_body       text DEFAULT 'Crimson Pro',
  font_ui         text DEFAULT 'Jost',
  email           text DEFAULT '',
  phone           text DEFAULT '',
  address         text DEFAULT '',
  siret           text DEFAULT '',
  tva             text DEFAULT '',
  instagram       text DEFAULT '',
  facebook        text DEFAULT '',
  currency        text DEFAULT 'EUR',
  tva_rate        numeric DEFAULT 20,
  free_shipping_threshold numeric DEFAULT 50,
  smtp_host       text DEFAULT '',
  smtp_user       text DEFAULT '',
  smtp_from       text DEFAULT '',
  updated_at      timestamptz DEFAULT now()
);

-- Insert default row for Heather & Lingon
INSERT INTO white_label_config (site_name, site_slogan, color_primary, color_secondary)
VALUES ('Heather & Lingon', 'British & Nordic Pantry', '#7B4F7B', '#8B2E3C')
ON CONFLICT DO NOTHING;
