-- SCHEMA 681c0670035a — genere le 2026-08-23 13:53
-- ═══════════════════════════════════════════════════════════════
--  SCHÉMA CONSOLIDÉ — instance neuve
--
--  GÉNÉRÉ par scripts/generer-schema.js le 2026-08-23
--  depuis l'introspection de la base de production (tables, colonnes,
--  clés) et les migrations (index, contraintes, RLS, fonctions, vues).
--  NE PAS ÉDITER À LA MAIN : relancer le générateur.
--
--  Usage : coller dans le SQL Editor d'un projet Supabase VIERGE,
--  puis install/seed.sql, puis node scripts/installer.js.
--  Idempotent : rejouable sans dommage.
-- ═══════════════════════════════════════════════════════════════

-- ─── Extension requise ───
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── Tables (42) — état réel de la production ───

CREATE TABLE IF NOT EXISTS abandoned_carts (
  id uuid DEFAULT gen_random_uuid(),
  customer_email text NOT NULL,
  customer_name text,
  cart_data jsonb,
  cart_total numeric DEFAULT 0,
  email_1_sent_at timestamp with time zone,
  email_2_sent_at timestamp with time zone,
  email_3_sent_at timestamp with time zone,
  recovered boolean DEFAULT false,
  recovered_at timestamp with time zone,
  order_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS accounting_entries (
  id uuid DEFAULT gen_random_uuid(),
  date date NOT NULL,
  type text NOT NULL,
  category text DEFAULT 'autre',
  description text NOT NULL,
  amount numeric DEFAULT 0 NOT NULL,
  reference_type text,
  reference_id text,
  reference_number text,
  created_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS admin_profiles (
  id uuid,
  email text NOT NULL,
  full_name text,
  role text DEFAULT 'admin',
  created_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS categories (
  id uuid DEFAULT extensions.uuid_generate_v4(),
  slug text NOT NULL,
  emoji text DEFAULT '📦' NOT NULL,
  name_sv text NOT NULL,
  name_fr text NOT NULL,
  name_en text NOT NULL,
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS cms_home (
  id uuid DEFAULT gen_random_uuid(),
  key text NOT NULL,
  value_fr text,
  value_sv text,
  value_en text,
  type text DEFAULT 'text',
  label text,
  updated_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS cms_pages (
  id uuid DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  title_fr text,
  title_sv text,
  title_en text,
  content_fr text,
  content_sv text,
  content_en text,
  meta_title text,
  meta_description text,
  is_published boolean DEFAULT true,
  show_in_nav boolean DEFAULT false,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  nav_label_fr text DEFAULT '',
  nav_label_sv text DEFAULT '',
  nav_label_en text DEFAULT '',
  hero_image text DEFAULT '',
  hero_title_fr text DEFAULT '',
  hero_title_sv text DEFAULT '',
  hero_title_en text DEFAULT '',
  hero_subtitle_fr text DEFAULT '',
  hero_subtitle_sv text DEFAULT '',
  hero_subtitle_en text DEFAULT '',
  blocks jsonb,
  is_active boolean DEFAULT true,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS company_settings (
  key text,
  value text,
  PRIMARY KEY (key)
);

CREATE TABLE IF NOT EXISTS contacts (
  id uuid DEFAULT gen_random_uuid(),
  type text DEFAULT 'client' NOT NULL,
  company text,
  first_name text,
  last_name text,
  email text,
  phone text,
  mobile text,
  address text,
  city text,
  zip text,
  country text DEFAULT 'France',
  website text,
  siret text,
  tva_number text,
  notes text,
  tags string[],
  supabase_user_id uuid,
  total_orders numeric DEFAULT 0,
  total_purchases numeric DEFAULT 0,
  last_order_at timestamp with time zone,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  lead_time_days integer,
  free_shipping_sek numeric,
  min_order_sek numeric,
  lang text,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS crm_ao_alerts (
  id uuid DEFAULT gen_random_uuid(),
  boamp_id text NOT NULL,
  titre text NOT NULL,
  acheteur text,
  ville text,
  dept text,
  cp text,
  date_publication date,
  date_limite date,
  montant_estime text,
  description text,
  url text,
  keywords_found string[],
  statut text DEFAULT 'nouvelle',
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS customer_accounts (
  id uuid DEFAULT gen_random_uuid(),
  contact_id uuid,
  supabase_user_id uuid,
  email text NOT NULL,
  first_name text,
  last_name text,
  shipping_address jsonb,
  billing_address jsonb,
  preferences jsonb,
  newsletter boolean DEFAULT false,
  total_orders integer DEFAULT 0,
  total_spent numeric DEFAULT 0,
  last_login_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS customer_profiles (
  email text,
  name text,
  phone text,
  address1 text,
  address2 text,
  city text,
  postal_code text,
  country text DEFAULT 'FR',
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (email)
);

CREATE TABLE IF NOT EXISTS email_drafts (
  id uuid DEFAULT gen_random_uuid(),
  to_emails text,
  cc_emails text,
  subject text,
  body text,
  attachments jsonb,
  in_reply_to text,
  imap_uid bigint,
  imap_folder text,
  updated_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS email_events (
  id uuid DEFAULT gen_random_uuid(),
  resend_email_id text,
  campaign_id uuid,
  to_email text,
  event_type text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS email_templates (
  key text,
  subject text,
  html text NOT NULL,
  updated_at timestamp with time zone DEFAULT now(),
  updated_by text,
  lang text DEFAULT 'fr' NOT NULL,
  PRIMARY KEY (key)
);

CREATE TABLE IF NOT EXISTS homepage_featured (
  id uuid DEFAULT extensions.uuid_generate_v4(),
  section text NOT NULL,
  product_id uuid,
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS homepage_sections (
  id uuid DEFAULT extensions.uuid_generate_v4(),
  key text NOT NULL,
  title_sv text,
  title_fr text,
  title_en text,
  subtitle_sv text,
  subtitle_fr text,
  subtitle_en text,
  body_sv text,
  body_fr text,
  body_en text,
  image_url text,
  cta_label_sv text,
  cta_label_fr text,
  cta_label_en text,
  cta_url text,
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  updated_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS inbox_messages (
  id uuid DEFAULT gen_random_uuid(),
  folder text DEFAULT 'INBOX' NOT NULL,
  uid bigint NOT NULL,
  uid_validity bigint,
  message_id text,
  from_name text,
  from_email text,
  to_emails string[],
  cc_emails string[],
  subject text,
  preview text,
  body_html text,
  body_text text,
  attachments jsonb,
  seen boolean DEFAULT false,
  flagged boolean DEFAULT false,
  answered boolean DEFAULT false,
  draft boolean DEFAULT false,
  label text,
  contact_id uuid,
  order_id uuid,
  sent_at timestamp with time zone,
  synced_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  has_attachment boolean,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS inbox_sync_state (
  folder text,
  uid_validity bigint,
  last_uid bigint DEFAULT 0,
  last_sync_at timestamp with time zone,
  last_error text,
  quota_used bigint,
  quota_total bigint,
  PRIMARY KEY (folder)
);

CREATE TABLE IF NOT EXISTS invoices (
  id uuid DEFAULT gen_random_uuid(),
  number text,
  date date,
  status text DEFAULT 'draft',
  client_name text,
  client_address text,
  client_email text,
  note text,
  lines jsonb,
  total_ht numeric DEFAULT 0,
  total_tva numeric DEFAULT 0,
  total_ttc numeric DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  order_id text,
  legal_mention text,
  seller_name text,
  seller_siret text,
  seller_address text,
  seller_email text,
  seller_phone text,
  paid_at timestamp with time zone,
  payment_method text,
  chain_hash text,
  chain_prev text,
  finalized_at timestamp with time zone,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS landed_costs (
  id uuid DEFAULT gen_random_uuid(),
  reception_id uuid,
  description text NOT NULL,
  amount numeric NOT NULL,
  allocation_method text DEFAULT 'equal' NOT NULL,
  status text DEFAULT 'draft' NOT NULL,
  lines jsonb,
  created_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS margin_products (
  id uuid DEFAULT gen_random_uuid(),
  name text NOT NULL,
  cat text,
  buy numeric DEFAULT 0,
  trans numeric DEFAULT 0,
  other numeric DEFAULT 0,
  revient numeric DEFAULT 0,
  sell numeric DEFAULT 0,
  stock integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS marketing_automation_logs (
  id uuid DEFAULT gen_random_uuid(),
  automation_id uuid,
  automation_type text,
  recipient_email text NOT NULL,
  sent_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS marketing_automations (
  id uuid DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL,
  status text DEFAULT 'active',
  delay_hours integer DEFAULT 24,
  subject text,
  custom_html text,
  sent_count integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS marketing_campaigns (
  id uuid DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL,
  status text DEFAULT 'draft',
  subject text,
  content text,
  target_segment text DEFAULT 'all',
  budget numeric DEFAULT 0,
  spent numeric DEFAULT 0,
  sent_count integer DEFAULT 0,
  open_count integer DEFAULT 0,
  click_count integer DEFAULT 0,
  conversion_count integer DEFAULT 0,
  revenue_generated numeric DEFAULT 0,
  scheduled_at timestamp with time zone,
  started_at timestamp with time zone,
  ended_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  delivered_count integer DEFAULT 0,
  bounced_count integer DEFAULT 0,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS media (
  id uuid DEFAULT extensions.uuid_generate_v4(),
  filename text NOT NULL,
  url text NOT NULL,
  size integer,
  mime_type text,
  alt_text text,
  uploaded_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS order_line_choices (
  id uuid DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  product_id uuid,
  line_ref text,
  line_name text NOT NULL,
  line_qty integer DEFAULT 1 NOT NULL,
  line_price numeric DEFAULT 0 NOT NULL,
  options jsonb NOT NULL,
  status text DEFAULT 'pending' NOT NULL,
  chosen_product_id uuid,
  chosen_label text,
  price_delta numeric,
  decided_at timestamp with time zone,
  sent_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  last_sent_at timestamp with time zone,
  relances integer DEFAULT 0 NOT NULL,
  last_send_error text,
  chosen_mix jsonb,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS orders (
  id uuid DEFAULT extensions.uuid_generate_v4(),
  order_number text NOT NULL,
  snipcart_token text,
  snipcart_invoice text,
  status text DEFAULT 'pending' NOT NULL,
  customer_name text,
  customer_email text,
  shipping_address jsonb,
  billing_address jsonb,
  lines jsonb NOT NULL,
  subtotal numeric DEFAULT 0,
  shipping numeric DEFAULT 0,
  total numeric DEFAULT 0,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  tracking_number text,
  stripe_session_id text,
  invoice_number text,
  delivery_mode text DEFAULT 'delivery',
  welcome_email_sent_at text,
  review_email_sent_at text,
  is_test boolean DEFAULT false NOT NULL,
  promo_code text,
  discount numeric DEFAULT 0,
  relay_point_id text,
  relay_point_name text,
  relay_point_address text,
  relay_point_pays text DEFAULT 'FR',
  mondial_relay_tracking text,
  mondial_relay_label_url text,
  transport_cost_real numeric DEFAULT 0,
  packaging_cost numeric DEFAULT 0,
  payment_link_url text,
  payment_link_sent_at timestamp with time zone,
  logspher_shipment_id integer,
  logspher_tracking text,
  logspher_label_url text,
  logspher_carrier_name text,
  logspher_carrier_code text,
  logspher_error text,
  exclude_from_stats boolean DEFAULT false NOT NULL,
  customer_phone text,
  refunded_amount numeric DEFAULT 0,
  refunded_at timestamp with time zone,
  refunds jsonb,
  picking jsonb,
  picked_at timestamp with time zone,
  lang text,
  shipping_country text,
  shipped_qty jsonb,
  last_shipment jsonb,
  backorder_at timestamp with time zone,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS product_suggestions (
  id uuid DEFAULT gen_random_uuid(),
  product_name text NOT NULL,
  description text,
  source_url text,
  customer_email text,
  lang text DEFAULT 'fr',
  status text DEFAULT 'new',
  created_at timestamp with time zone DEFAULT now(),
  customer_name text,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS product_suppliers (
  product_id uuid,
  supplier_id uuid,
  cost_eur numeric,
  cost_sek numeric,
  pack_size integer,
  times_bought integer DEFAULT 0 NOT NULL,
  last_bought_at timestamp with time zone,
  is_preferred boolean DEFAULT false NOT NULL,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (supplier_id)
);

CREATE TABLE IF NOT EXISTS product_variants (
  id uuid DEFAULT extensions.uuid_generate_v4(),
  product_id uuid,
  label text NOT NULL,
  price numeric NOT NULL,
  is_default boolean DEFAULT false,
  sort_order integer DEFAULT 0,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS product_velocity (
  product_id uuid,
  units_sold integer DEFAULT 0 NOT NULL,
  days_in_stock integer DEFAULT 0 NOT NULL,
  days_window integer DEFAULT 0 NOT NULL,
  days_out integer DEFAULT 0 NOT NULL,
  weekly numeric DEFAULT 0 NOT NULL,
  weekly_calendar numeric DEFAULT 0 NOT NULL,
  computed_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (product_id)
);

CREATE TABLE IF NOT EXISTS products (
  id uuid DEFAULT extensions.uuid_generate_v4(),
  category_id uuid,
  name_sv text NOT NULL,
  name_fr text NOT NULL,
  name_en text NOT NULL,
  subtitle_sv text,
  subtitle_fr text,
  subtitle_en text,
  desc_sv text,
  desc_fr text,
  desc_en text,
  price numeric DEFAULT 0 NOT NULL,
  weight text,
  origin_sv text,
  origin_fr text,
  origin_en text,
  image_url text,
  badge text,
  is_bestseller boolean DEFAULT false,
  is_new boolean DEFAULT false,
  is_active boolean DEFAULT true,
  rating numeric DEFAULT 4.5,
  reviews_count integer DEFAULT 0,
  tags string[],
  usage_sv text,
  usage_fr text,
  usage_en text,
  ingredients_sv text,
  ingredients_fr text,
  ingredients_en text,
  storage_sv text,
  storage_fr text,
  storage_en text,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  stock integer DEFAULT 0,
  stock_alert integer DEFAULT 5,
  track_stock boolean DEFAULT false,
  allergens_sv text DEFAULT '',
  allergens_fr text DEFAULT '',
  allergens_en text DEFAULT '',
  nutrition jsonb,
  extra_images jsonb,
  cost_price numeric DEFAULT 0,
  pickup_only boolean DEFAULT false NOT NULL,
  reorder_qty integer,
  ean text,
  sku text,
  pack_size integer DEFAULT 1 NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS promo_code_usages (
  id uuid DEFAULT extensions.uuid_generate_v4(),
  promo_code_id uuid NOT NULL,
  customer_email text NOT NULL,
  used_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS promo_codes (
  id uuid DEFAULT gen_random_uuid(),
  code text NOT NULL,
  type text DEFAULT 'percent',
  value numeric NOT NULL,
  min_order numeric DEFAULT 0,
  max_uses integer,
  used_count integer DEFAULT 0,
  valid_from date,
  valid_until date,
  is_active boolean DEFAULT true,
  campaign_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  single_use_per_customer boolean DEFAULT false NOT NULL,
  gift_product_ids jsonb,
  gift_trigger_product_ids jsonb,
  gift_trigger_qty integer,
  gift_max integer,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id uuid DEFAULT gen_random_uuid(),
  number text NOT NULL,
  status text DEFAULT 'draft',
  supplier_id uuid,
  supplier_name text,
  expected_date date,
  notes text,
  lines jsonb,
  subtotal numeric DEFAULT 0,
  tax numeric DEFAULT 0,
  shipping numeric DEFAULT 0,
  total numeric DEFAULT 0,
  currency text DEFAULT 'EUR',
  invoice_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  exchange_rate numeric,
  payment_date date,
  coverage_weeks integer,
  exchange_rate_used numeric,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS purchase_tickets (
  id uuid DEFAULT extensions.uuid_generate_v4(),
  store text,
  purchased_at date,
  currency text DEFAULT 'SEK',
  exchange_rate numeric,
  vat_rate numeric DEFAULT 12,
  total_ocr numeric,
  total_lines numeric,
  goods_eur_ht numeric,
  image_urls jsonb,
  lines jsonb,
  purchase_order_id uuid,
  reception_id uuid,
  status text DEFAULT 'draft',
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS purchases (
  id uuid DEFAULT gen_random_uuid(),
  supplier text NOT NULL,
  date date,
  ref text,
  status text DEFAULT 'received',
  amount numeric DEFAULT 0,
  transport numeric DEFAULT 0,
  total numeric DEFAULT 0,
  products text,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS receptions (
  id uuid DEFAULT gen_random_uuid(),
  number text NOT NULL,
  purchase_order_id uuid,
  supplier_id uuid,
  supplier_name text,
  status text DEFAULT 'draft',
  received_at timestamp with time zone DEFAULT now(),
  notes text,
  lines jsonb,
  invoice_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS scheduled_emails (
  id uuid DEFAULT gen_random_uuid(),
  to_emails text NOT NULL,
  cc_emails text,
  subject text NOT NULL,
  body text,
  attachments jsonb,
  in_reply_to text,
  send_at timestamp with time zone NOT NULL,
  status text DEFAULT 'pending' NOT NULL,
  attempts integer DEFAULT 0 NOT NULL,
  last_error text,
  sent_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id uuid DEFAULT gen_random_uuid(),
  product_id uuid,
  quantity integer,
  type text,
  reason text,
  order_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  delta integer,
  qty_before integer,
  qty_after integer,
  reference text,
  note text,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS ticket_aliases (
  id uuid DEFAULT extensions.uuid_generate_v4(),
  raw_label text NOT NULL,
  store text,
  product_id uuid,
  hits integer DEFAULT 1,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS white_label_config (
  id uuid DEFAULT gen_random_uuid(),
  site_name text DEFAULT 'Mon Site',
  site_slogan text,
  site_description text,
  logo_url text,
  favicon_url text,
  color_primary text DEFAULT '#3E5238',
  color_secondary text DEFAULT '#9E5A3C',
  color_bg text DEFAULT '#F6F1E9',
  color_text text DEFAULT '#1C2028',
  font_display text DEFAULT 'Cormorant Garamond',
  font_body text DEFAULT 'Crimson Pro',
  font_ui text DEFAULT 'Jost',
  email text,
  phone text,
  address text,
  siret text,
  tva text,
  instagram text,
  facebook text,
  currency text DEFAULT 'EUR',
  tva_rate numeric DEFAULT 20,
  free_shipping_threshold numeric DEFAULT 50,
  smtp_host text,
  smtp_port integer DEFAULT 587,
  smtp_user text,
  smtp_pass text,
  smtp_from text,
  stripe_public_key text,
  stripe_secret_key text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  pinterest text DEFAULT '',
  announcement_fr text DEFAULT 'Livraison gratuite dès 50€ ·
  Produits authentiques · Paiement sécurisé',
  announcement_sv text DEFAULT 'Fri frakt från 50€ · Autentiska
   produkter · Säker betalning',
  announcement_en text DEFAULT 'Free delivery from €50 ·
  Authentic products · Secure payment',
  footer_desc_fr text DEFAULT '',
  footer_desc_sv text DEFAULT '',
  footer_desc_en text DEFAULT '',
  footer_tagline_fr text DEFAULT '',
  footer_tagline_sv text DEFAULT '',
  footer_tagline_en text DEFAULT '',
  front_url text,
  ship_promo_active boolean DEFAULT false,
  ship_promo_threshold numeric,
  ship_promo_threshold_intl numeric,
  ship_promo_from date,
  ship_promo_until date,
  ship_promo_label_fr text,
  ship_promo_label_sv text,
  ship_promo_label_en text,
  legal_name text,
  rcs_city text,
  shop_city text,
  PRIMARY KEY (id)
);

-- ─── Clés étrangères (après création de toutes les tables) ───
DO $x$ BEGIN
  ALTER TABLE customer_accounts ADD CONSTRAINT customer_accounts_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $x$;
DO $x$ BEGIN
  ALTER TABLE homepage_featured ADD CONSTRAINT homepage_featured_product_id_fkey FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $x$;
DO $x$ BEGIN
  ALTER TABLE landed_costs ADD CONSTRAINT landed_costs_reception_id_fkey FOREIGN KEY (reception_id) REFERENCES receptions (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $x$;
DO $x$ BEGIN
  ALTER TABLE order_line_choices ADD CONSTRAINT order_line_choices_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $x$;
DO $x$ BEGIN
  ALTER TABLE product_suppliers ADD CONSTRAINT product_suppliers_product_id_fkey FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $x$;
DO $x$ BEGIN
  ALTER TABLE product_suppliers ADD CONSTRAINT product_suppliers_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES contacts (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $x$;
DO $x$ BEGIN
  ALTER TABLE product_variants ADD CONSTRAINT product_variants_product_id_fkey FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $x$;
DO $x$ BEGIN
  ALTER TABLE product_velocity ADD CONSTRAINT product_velocity_product_id_fkey FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $x$;
DO $x$ BEGIN
  ALTER TABLE products ADD CONSTRAINT products_category_id_fkey FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $x$;
DO $x$ BEGIN
  ALTER TABLE promo_code_usages ADD CONSTRAINT promo_code_usages_promo_code_id_fkey FOREIGN KEY (promo_code_id) REFERENCES promo_codes (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $x$;
DO $x$ BEGIN
  ALTER TABLE promo_codes ADD CONSTRAINT promo_codes_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES marketing_campaigns (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $x$;
DO $x$ BEGIN
  ALTER TABLE purchase_orders ADD CONSTRAINT purchase_orders_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES contacts (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $x$;
DO $x$ BEGIN
  ALTER TABLE purchase_orders ADD CONSTRAINT purchase_orders_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES purchases (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $x$;
DO $x$ BEGIN
  ALTER TABLE receptions ADD CONSTRAINT receptions_purchase_order_id_fkey FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $x$;
DO $x$ BEGIN
  ALTER TABLE receptions ADD CONSTRAINT receptions_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES contacts (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $x$;
DO $x$ BEGIN
  ALTER TABLE receptions ADD CONSTRAINT receptions_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES purchases (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $x$;
DO $x$ BEGIN
  ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_product_id_fkey FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $x$;
DO $x$ BEGIN
  ALTER TABLE ticket_aliases ADD CONSTRAINT ticket_aliases_product_id_fkey FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $x$;

-- ─── Index, contraintes, RLS, fonctions, triggers, vues ───
-- Greffés depuis les migrations, dans l'ordre chronologique.

-- 001_initial_schema.sql
-- ─── TRIGGERS: updated_at ───────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 001_initial_schema.sql
DROP TRIGGER IF EXISTS products_updated_at ON products;
CREATE TRIGGER products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 001_initial_schema.sql
DROP TRIGGER IF EXISTS homepage_sections_updated_at ON homepage_sections;
CREATE TRIGGER homepage_sections_updated_at
  BEFORE UPDATE ON homepage_sections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 001_initial_schema.sql
-- ─── ROW LEVEL SECURITY ─────────────────────────────────────────
-- Lecture publique pour les produits et catégories (front)
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- 001_initial_schema.sql
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- 001_initial_schema.sql
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;

-- 001_initial_schema.sql
ALTER TABLE homepage_sections ENABLE ROW LEVEL SECURITY;

-- 001_initial_schema.sql
ALTER TABLE homepage_featured ENABLE ROW LEVEL SECURITY;

-- 001_initial_schema.sql
ALTER TABLE media ENABLE ROW LEVEL SECURITY;

-- 001_initial_schema.sql
ALTER TABLE admin_profiles ENABLE ROW LEVEL SECURITY;

-- 001_initial_schema.sql
DROP POLICY IF EXISTS "public_read_categories" ON categories;
-- Lecture publique (front HTML)
CREATE POLICY "public_read_categories"    ON categories    FOR SELECT USING (is_active = true);

-- 001_initial_schema.sql
DROP POLICY IF EXISTS "public_read_products" ON products;
CREATE POLICY "public_read_products"      ON products      FOR SELECT USING (is_active = true);

-- 001_initial_schema.sql
DROP POLICY IF EXISTS "public_read_variants" ON product_variants;
CREATE POLICY "public_read_variants"      ON product_variants FOR SELECT USING (true);

-- 001_initial_schema.sql
DROP POLICY IF EXISTS "public_read_homepage" ON homepage_sections;
CREATE POLICY "public_read_homepage"      ON homepage_sections FOR SELECT USING (is_active = true);

-- 001_initial_schema.sql
DROP POLICY IF EXISTS "public_read_featured" ON homepage_featured;
CREATE POLICY "public_read_featured"      ON homepage_featured FOR SELECT USING (is_active = true);

-- 001_initial_schema.sql
DROP POLICY IF EXISTS "admin_all_categories" ON categories;
-- Écriture admin uniquement (authenticated)
CREATE POLICY "admin_all_categories"   ON categories    FOR ALL USING (auth.role() = 'authenticated');

-- 001_initial_schema.sql
DROP POLICY IF EXISTS "admin_all_products" ON products;
CREATE POLICY "admin_all_products"     ON products      FOR ALL USING (auth.role() = 'authenticated');

-- 001_initial_schema.sql
DROP POLICY IF EXISTS "admin_all_variants" ON product_variants;
CREATE POLICY "admin_all_variants"     ON product_variants FOR ALL USING (auth.role() = 'authenticated');

-- 001_initial_schema.sql
DROP POLICY IF EXISTS "admin_all_homepage" ON homepage_sections;
CREATE POLICY "admin_all_homepage"     ON homepage_sections FOR ALL USING (auth.role() = 'authenticated');

-- 001_initial_schema.sql
DROP POLICY IF EXISTS "admin_all_featured" ON homepage_featured;
CREATE POLICY "admin_all_featured"     ON homepage_featured FOR ALL USING (auth.role() = 'authenticated');

-- 001_initial_schema.sql
DROP POLICY IF EXISTS "admin_all_media" ON media;
CREATE POLICY "admin_all_media"        ON media         FOR ALL USING (auth.role() = 'authenticated');

-- 001_initial_schema.sql
DROP POLICY IF EXISTS "admin_own_profile" ON admin_profiles;
CREATE POLICY "admin_own_profile"      ON admin_profiles FOR ALL USING (auth.uid() = id);

-- 002_gestion_schema.sql
DROP TRIGGER IF EXISTS invoices_updated_at ON invoices;
-- ─── TRIGGERS ───────────────────────────────────────────────────
CREATE TRIGGER invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 002_gestion_schema.sql
DROP TRIGGER IF EXISTS margin_products_updated_at ON margin_products;
CREATE TRIGGER margin_products_updated_at
  BEFORE UPDATE ON margin_products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 002_gestion_schema.sql
ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;

-- 002_gestion_schema.sql
DROP POLICY IF EXISTS "admin_clients" ON clients;
-- Accès admin uniquement (authenticated) — pas de lecture publique
CREATE POLICY "admin_clients"    ON clients          FOR ALL USING (auth.role() = 'authenticated');

-- 002_gestion_schema.sql
DROP POLICY IF EXISTS "admin_invoices" ON invoices;
CREATE POLICY "admin_invoices"   ON invoices         FOR ALL USING (auth.role() = 'authenticated');

-- 002_gestion_schema.sql
DROP POLICY IF EXISTS "admin_suppliers" ON suppliers;
CREATE POLICY "admin_suppliers"  ON suppliers        FOR ALL USING (auth.role() = 'authenticated');

-- 002_gestion_schema.sql
DROP POLICY IF EXISTS "admin_purchases" ON purchases;
CREATE POLICY "admin_purchases"  ON purchases        FOR ALL USING (auth.role() = 'authenticated');

-- 002_gestion_schema.sql
DROP POLICY IF EXISTS "admin_margins" ON margin_products;
CREATE POLICY "admin_margins"    ON margin_products  FOR ALL USING (auth.role() = 'authenticated');

-- 002_gestion_schema.sql
DROP POLICY IF EXISTS "admin_shipments" ON shipments;
CREATE POLICY "admin_shipments"  ON shipments        FOR ALL USING (auth.role() = 'authenticated');

-- 002_gestion_schema.sql
DROP POLICY IF EXISTS "admin_settings" ON company_settings;
CREATE POLICY "admin_settings"   ON company_settings FOR ALL USING (auth.role() = 'authenticated');

-- 002_gestion_schema.sql
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

-- 002_gestion_schema.sql
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

-- 006_cms_home.sql
ALTER TABLE cms_home ENABLE ROW LEVEL SECURITY;

-- 010_orders_table.sql
DROP TRIGGER IF EXISTS orders_updated_at ON orders;
CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 010_orders_table.sql
-- ─── RLS ────────────────────────────────────────────────────────
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- 010_orders_table.sql
DROP POLICY IF EXISTS "admin_all_orders" ON orders;
-- Service role (webhook) peut tout faire sans RLS
-- Admin authentifié peut tout lire/modifier
CREATE POLICY "admin_all_orders"
  ON orders FOR ALL
  USING (auth.role() = 'authenticated');

-- 010_orders_table.sql
-- ─── INDEX ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS orders_status_idx        ON orders(status);

-- 010_orders_table.sql
CREATE INDEX IF NOT EXISTS orders_email_idx         ON orders(customer_email);

-- 010_orders_table.sql
CREATE INDEX IF NOT EXISTS orders_snipcart_token_idx ON orders(snipcart_token);

-- 010_orders_table.sql
CREATE INDEX IF NOT EXISTS orders_created_at_idx    ON orders(created_at DESC);

-- 011_promo_per_user.sql
CREATE INDEX IF NOT EXISTS idx_promo_usages_email ON promo_code_usages (customer_email);

-- 015_invoices_accounting.sql
CREATE INDEX IF NOT EXISTS idx_accounting_ref ON accounting_entries (reference_type, reference_id);

-- 015_invoices_accounting.sql
-- RLS
ALTER TABLE accounting_entries ENABLE ROW LEVEL SECURITY;

-- 015_invoices_accounting.sql
DROP POLICY IF EXISTS "admin_accounting" ON accounting_entries;

-- 015_invoices_accounting.sql
DROP POLICY IF EXISTS "admin_accounting" ON accounting_entries;
CREATE POLICY "admin_accounting" ON accounting_entries FOR ALL USING (auth.role() = 'authenticated');

-- 016_orders_is_test.sql
CREATE INDEX IF NOT EXISTS idx_orders_is_test ON orders (is_test) WHERE is_test = TRUE;

-- 019_invoice_payment_fields.sql
COMMENT ON COLUMN invoices.paid_at        IS 'Date de paiement effective';

-- 019_invoice_payment_fields.sql
COMMENT ON COLUMN invoices.payment_method IS 'Moyen de paiement : card | transfer | paypal | stripe | other';

-- 024_orders_exclude_from_stats.sql
CREATE INDEX IF NOT EXISTS idx_orders_exclude_from_stats
  ON orders (exclude_from_stats) WHERE exclude_from_stats = true;

-- 025_accounting_entries_unique.sql
-- 2) Index unique partiel : un seul (type_de_référence, référence, type, catégorie)
--    possible dès qu'une référence existe. Les écritures manuelles restent libres.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_accounting_entry_ref
  ON accounting_entries (reference_type, reference_id, type, coalesce(category, ''))
  WHERE reference_id IS NOT NULL;

-- 028_orders_partial_refund.sql
COMMENT ON COLUMN orders.refunded_amount IS 'Cumul TTC déjà remboursé au client (partiel ou total)';

-- 028_orders_partial_refund.sql
COMMENT ON COLUMN orders.refunds          IS 'Historique détaillé des remboursements';

-- 029_shipping_promo_operation.sql
COMMENT ON COLUMN white_label_config.ship_promo_active         IS 'Opération franco de port activée (encore soumise aux dates)';

-- 029_shipping_promo_operation.sql
COMMENT ON COLUMN white_label_config.ship_promo_threshold      IS 'Seuil France pendant l''opération (NULL = pas d''opération FR)';

-- 029_shipping_promo_operation.sql
COMMENT ON COLUMN white_label_config.ship_promo_threshold_intl IS 'Seuil international pendant l''opération (NULL = seuil normal maintenu)';

-- 029_shipping_promo_operation.sql
COMMENT ON COLUMN white_label_config.ship_promo_from           IS 'Début inclus (NULL = pas de borne)';

-- 029_shipping_promo_operation.sql
COMMENT ON COLUMN white_label_config.ship_promo_until          IS 'Fin incluse (NULL = pas de borne)';

-- 030_ticket_scan.sql
-- Unicité, mais uniquement sur les valeurs renseignées : la plupart
-- des produits n'ont pas encore de code-barres.
CREATE UNIQUE INDEX IF NOT EXISTS products_ean_unique
  ON products (ean) WHERE ean IS NOT NULL AND ean <> '';

-- 030_ticket_scan.sql
COMMENT ON COLUMN products.ean IS 'Code-barres EAN-13, scanné en magasin';

-- 030_ticket_scan.sql
-- Un libellé peut désigner un produit différent selon le magasin.
CREATE UNIQUE INDEX IF NOT EXISTS ticket_aliases_label_store
  ON ticket_aliases (lower(raw_label), coalesce(store, ''));

-- 030_ticket_scan.sql
ALTER TABLE ticket_aliases ENABLE ROW LEVEL SECURITY;

-- 030_ticket_scan.sql
DROP POLICY IF EXISTS "admin_ticket_aliases" ON ticket_aliases;

-- 030_ticket_scan.sql
DROP POLICY IF EXISTS "admin_ticket_aliases" ON ticket_aliases;
CREATE POLICY "admin_ticket_aliases" ON ticket_aliases FOR ALL USING (auth.role() = 'authenticated');

-- 030_ticket_scan.sql
ALTER TABLE purchase_tickets ENABLE ROW LEVEL SECURITY;

-- 030_ticket_scan.sql
DROP POLICY IF EXISTS "admin_purchase_tickets" ON purchase_tickets;

-- 030_ticket_scan.sql
DROP POLICY IF EXISTS "admin_purchase_tickets" ON purchase_tickets;
CREATE POLICY "admin_purchase_tickets" ON purchase_tickets FOR ALL USING (auth.role() = 'authenticated');

-- 030_ticket_scan.sql
COMMENT ON COLUMN orders.picking IS 'Quantités déjà scannées par product_id';

-- 031_stock_ledger.sql
-- ─── 4. Index ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS stock_movements_product ON stock_movements (product_id, created_at DESC);

-- 031_stock_ledger.sql
-- Sert la garde d'idempotence : on ne déduit jamais deux fois la même
-- ligne de commande, même si le webhook Stripe est rejoué.
CREATE INDEX IF NOT EXISTS stock_movements_order   ON stock_movements (order_id, product_id);

-- 031_stock_ledger.sql
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

-- 031_stock_ledger.sql
DROP POLICY IF EXISTS "admin_stock_movements" ON stock_movements;

-- 031_stock_ledger.sql
DROP POLICY IF EXISTS "admin_stock_movements" ON stock_movements;
CREATE POLICY "admin_stock_movements" ON stock_movements FOR ALL USING (auth.role() = 'authenticated');

-- 031_stock_ledger.sql
COMMENT ON COLUMN stock_movements.delta IS 'Variation signée : négative pour une sortie';

-- 031_stock_ledger.sql
COMMENT ON COLUMN stock_movements.order_id IS 'Commande client à l''origine de la sortie — sert de garde anti-doublon';

-- 032_remplacement.sql
CREATE INDEX IF NOT EXISTS order_line_choices_order ON order_line_choices (order_id, created_at DESC);

-- 032_remplacement.sql
-- Sert l'ecran back-office : les demandes qui attendent encore une reponse.
CREATE INDEX IF NOT EXISTS order_line_choices_status ON order_line_choices (status) WHERE status = 'pending';

-- 032_remplacement.sql
ALTER TABLE order_line_choices ENABLE ROW LEVEL SECURITY;

-- 032_remplacement.sql
-- Aucune politique publique : la route de reponse passe par la cle service
-- apres verification du jeton. Le client n'a jamais d'acces direct.
DROP POLICY IF EXISTS "admin_order_line_choices" ON order_line_choices;

-- 032_remplacement.sql
DROP POLICY IF EXISTS "admin_order_line_choices" ON order_line_choices;
CREATE POLICY "admin_order_line_choices" ON order_line_choices FOR ALL USING (auth.role() = 'authenticated');

-- 032_remplacement.sql
COMMENT ON COLUMN order_line_choices.price_delta IS
  'Ecart recalcule cote serveur au moment du clic — jamais repris du lien';

-- 033_email_templates.sql
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;

-- 033_email_templates.sql
DROP POLICY IF EXISTS "admin_email_templates" ON email_templates;

-- 033_email_templates.sql
DROP POLICY IF EXISTS "admin_email_templates" ON email_templates;
CREATE POLICY "admin_email_templates" ON email_templates FOR ALL USING (auth.role() = 'authenticated');

-- 033_email_templates.sql
COMMENT ON TABLE email_templates IS
  'Surcharges des gabarits ; une cle absente signifie « fichier d''origine »';

-- 034_boite_mail.sql
-- Cle naturelle IMAP : evite les doublons a chaque synchronisation.
CREATE UNIQUE INDEX IF NOT EXISTS inbox_messages_uid ON inbox_messages (folder, uid);

-- 034_boite_mail.sql
CREATE INDEX IF NOT EXISTS inbox_messages_date  ON inbox_messages (folder, sent_at DESC);

-- 034_boite_mail.sql
CREATE INDEX IF NOT EXISTS inbox_messages_from  ON inbox_messages (from_email);

-- 034_boite_mail.sql
CREATE INDEX IF NOT EXISTS inbox_messages_unseen ON inbox_messages (folder) WHERE seen = false;

-- 034_boite_mail.sql
ALTER TABLE inbox_messages ENABLE ROW LEVEL SECURITY;

-- 034_boite_mail.sql
DROP POLICY IF EXISTS "admin_inbox_messages" ON inbox_messages;

-- 034_boite_mail.sql
DROP POLICY IF EXISTS "admin_inbox_messages" ON inbox_messages;
CREATE POLICY "admin_inbox_messages" ON inbox_messages FOR ALL USING (auth.role() = 'authenticated');

-- 034_boite_mail.sql
ALTER TABLE inbox_sync_state ENABLE ROW LEVEL SECURITY;

-- 034_boite_mail.sql
DROP POLICY IF EXISTS "admin_inbox_sync_state" ON inbox_sync_state;

-- 034_boite_mail.sql
DROP POLICY IF EXISTS "admin_inbox_sync_state" ON inbox_sync_state;
CREATE POLICY "admin_inbox_sync_state" ON inbox_sync_state FOR ALL USING (auth.role() = 'authenticated');

-- 034_boite_mail.sql
COMMENT ON COLUMN inbox_messages.uid IS
  'UID IMAP — unique dans son dossier seulement, invalide si uid_validity change';

-- 035_brouillons_programmes.sql
CREATE INDEX IF NOT EXISTS inbox_messages_pj
  ON inbox_messages (folder, sent_at DESC) WHERE has_attachment;

-- 035_brouillons_programmes.sql
CREATE INDEX IF NOT EXISTS email_drafts_date ON email_drafts (updated_at DESC);

-- 035_brouillons_programmes.sql
ALTER TABLE email_drafts ENABLE ROW LEVEL SECURITY;

-- 035_brouillons_programmes.sql
DROP POLICY IF EXISTS "admin_email_drafts" ON email_drafts;

-- 035_brouillons_programmes.sql
DROP POLICY IF EXISTS "admin_email_drafts" ON email_drafts;
CREATE POLICY "admin_email_drafts" ON email_drafts FOR ALL USING (auth.role() = 'authenticated');

-- 035_brouillons_programmes.sql
CREATE INDEX IF NOT EXISTS scheduled_emails_due
  ON scheduled_emails (send_at) WHERE status = 'pending';

-- 035_brouillons_programmes.sql
ALTER TABLE scheduled_emails ENABLE ROW LEVEL SECURITY;

-- 035_brouillons_programmes.sql
DROP POLICY IF EXISTS "admin_scheduled_emails" ON scheduled_emails;

-- 035_brouillons_programmes.sql
DROP POLICY IF EXISTS "admin_scheduled_emails" ON scheduled_emails;
CREATE POLICY "admin_scheduled_emails" ON scheduled_emails FOR ALL USING (auth.role() = 'authenticated');

-- 035_brouillons_programmes.sql
COMMENT ON COLUMN scheduled_emails.status IS
  'pending -> sending -> sent : le passage par sending empeche le double envoi';

-- 035_brouillons_programmes.sql
COMMENT ON COLUMN email_drafts.imap_uid IS
  'Copie serveur du brouillon, a supprimer avant d''en deposer une nouvelle';

-- 036_sku_produits.sql
CREATE UNIQUE INDEX IF NOT EXISTS products_sku_unique ON products (sku) WHERE sku IS NOT NULL;

-- 036_sku_produits.sql
COMMENT ON COLUMN products.sku IS
  'Reference stable. Ne jamais la recalculer depuis sort_order : elle sert sur les documents.';

-- 037_moteur_achats.sql
CREATE INDEX IF NOT EXISTS product_suppliers_prod ON product_suppliers (product_id);

-- 037_moteur_achats.sql
CREATE INDEX IF NOT EXISTS product_suppliers_sup  ON product_suppliers (supplier_id);

-- 037_moteur_achats.sql
ALTER TABLE product_suppliers ENABLE ROW LEVEL SECURITY;

-- 037_moteur_achats.sql
DROP POLICY IF EXISTS "admin_product_suppliers" ON product_suppliers;

-- 037_moteur_achats.sql
DROP POLICY IF EXISTS "admin_product_suppliers" ON product_suppliers;
CREATE POLICY "admin_product_suppliers" ON product_suppliers FOR ALL USING (auth.role() = 'authenticated');

-- 037_moteur_achats.sql
COMMENT ON TABLE product_suppliers IS
  'Un article s''achete chez plusieurs magasins a des prix differents — le moins cher n''est pas toujours le dernier utilise';

-- 037_moteur_achats.sql
ALTER TABLE product_velocity ENABLE ROW LEVEL SECURITY;

-- 037_moteur_achats.sql
DROP POLICY IF EXISTS "admin_product_velocity" ON product_velocity;

-- 037_moteur_achats.sql
DROP POLICY IF EXISTS "admin_product_velocity" ON product_velocity;
CREATE POLICY "admin_product_velocity" ON product_velocity FOR ALL USING (auth.role() = 'authenticated');

-- 037_moteur_achats.sql
COMMENT ON COLUMN product_velocity.weekly IS
  'Ventes hebdo rapportees aux jours de disponibilite : commander sur la moyenne calendaire reproduit la rupture';

-- 038_langue_client.sql
ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_lang_valide;

-- 038_langue_client.sql
ALTER TABLE contacts ADD  CONSTRAINT contacts_lang_valide
  CHECK (lang IS NULL OR lang IN ('fr', 'en', 'sv'));

-- 038_langue_client.sql
COMMENT ON COLUMN orders.lang IS
  'Langue des documents et emails de cette commande. NULL = deduite du pays de livraison ; une valeur = choix manuel, jamais ecrase par un recalcul.';

-- 038_langue_client.sql
COMMENT ON COLUMN orders.shipping_country IS
  'Code ISO a deux lettres extrait de l''adresse de livraison, qui existe en deux formats incompatibles.';

-- 038_langue_client.sql
ALTER TABLE email_templates DROP CONSTRAINT IF EXISTS email_templates_lang_valide;

-- 038_langue_client.sql
ALTER TABLE email_templates ADD  CONSTRAINT email_templates_lang_valide
  CHECK (lang IN ('fr', 'en', 'sv'));

-- 038_langue_client.sql
-- La cle seule ne suffit plus a identifier une ligne.
ALTER TABLE email_templates DROP CONSTRAINT IF EXISTS email_templates_key_key;

-- 038_langue_client.sql
CREATE UNIQUE INDEX email_templates_key_lang ON email_templates (key, lang);

-- 038_langue_client.sql
COMMENT ON COLUMN email_templates.lang IS
  'Un gabarit par cle ET par langue : personnaliser le francais ne doit pas toucher au suedois.';

-- 039_langue_profil_client.sql
ALTER TABLE customer_profiles DROP CONSTRAINT IF EXISTS customer_profiles_lang_valide;

-- 039_langue_profil_client.sql
ALTER TABLE customer_profiles ADD  CONSTRAINT customer_profiles_lang_valide
  CHECK (lang IS NULL OR lang IN ('fr', 'en', 'sv'));

-- 039_langue_profil_client.sql
COMMENT ON COLUMN customer_profiles.lang IS
  'Langue preferee du client. NULL = inconnue, on deduit du pays de livraison. Volontairement sans DEFAULT : voir country, dont le DEFAULT ''FR'' rend 12 profils sur 19 indistinguables entre « francais » et « non renseigne ».';

-- 039_langue_profil_client.sql
COMMENT ON COLUMN customer_profiles.country IS
  'ATTENTION : DEFAULT ''FR''. Un profil sans adresse affiche FR sans que le client l''ait jamais indique — ne pas s''en servir comme source de pays sans verifier qu''une adresse existe.';

-- 040_reliquat_client.sql
-- ═══════════════════════════════════════════════════════════════
--  040 — Reliquat client (expedition partielle)
--
--  Jusqu'ici une commande partait entiere ou ne partait pas : l'ecran de
--  preparation refusait de valider tant que tout n'etait pas scanne. Il
--  manquait donc le cas le plus banal — il manque un article, on envoie
--  le reste tout de suite et on garde le reliquat.
--
--  Le bon de livraison portait deja deux colonnes « Commande » et
--  « Livre », mais l'ecran les remplissait avec la MEME valeur : le
--  client lisait toujours « commande 3 / livre 3 », meme avec deux
--  articles dans le carton. La structure existait, elle mentait.
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. Statuts reellement autorises ──────────────────────────────
-- La contrainte datait de la 010 et n'a jamais suivi l'interface : les
-- boutons « Confirmee » et « En preparation » existent a l'ecran mais
-- sont REFUSES par la base. Le clic affichait « ✅ » sans que rien ne
-- change. On aligne la contrainte sur ce que l'interface propose, et on
-- y ajoute le nouveau statut.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;

-- 040_reliquat_client.sql
ALTER TABLE orders ADD  CONSTRAINT orders_status_check
  CHECK (status IN (
    'pending', 'paid', 'confirmed', 'preparing',
    'partial',            -- une partie est partie, le reste est du
    'shipped', 'delivered', 'cancelled', 'refunded', 'abandoned'
  ));

-- 040_reliquat_client.sql
COMMENT ON COLUMN orders.shipped_qty IS
  'Cumul des quantites reellement expediees, par product_id. Le reste du = quantite commandee moins cette valeur.';

-- 040_reliquat_client.sql
COMMENT ON COLUMN orders.last_shipment IS
  'Quantites du dernier colis, par product_id. Alimente le bon de livraison, qui decrit un colis et non un cumul.';

-- 040_reliquat_client.sql
COMMENT ON COLUMN orders.backorder_at IS
  'Date de creation du reliquat. NULL tant qu''aucune expedition partielle n''a eu lieu.';

-- 040_reliquat_client.sql
-- ─── 3. Retrouver les reliquats en attente ────────────────────────
CREATE INDEX IF NOT EXISTS orders_backorder ON orders (status) WHERE status = 'partial';

-- 041_relance_rupture.sql
COMMENT ON COLUMN order_line_choices.sent_at IS
  'Date de CREATION de la demande (valeur par defaut). Ne prouve pas qu''un email est parti — voir last_sent_at.';

-- 041_relance_rupture.sql
COMMENT ON COLUMN order_line_choices.last_sent_at IS
  'Date du dernier envoi REUSSI. NULL = aucun envoi confirme.';

-- 041_relance_rupture.sql
COMMENT ON COLUMN order_line_choices.relances IS
  'Nombre de relances apres le premier envoi.';

-- 042_remplacement_panache.sql
COMMENT ON COLUMN order_line_choices.chosen_mix IS
  'Repartition choisie : [{ product_id, nom, qte, prix }]. NULL = un seul article de remplacement (voir chosen_product_id). La somme des qte vaut line_qty.';

-- 043_cadeau_par_quantite.sql
COMMENT ON COLUMN promo_codes.gift_trigger_product_ids IS
  'Produits dont l''achat declenche le cadeau. NULL = l''offre se declenche sur le montant (min_order).';

-- 043_cadeau_par_quantite.sql
COMMENT ON COLUMN promo_codes.gift_trigger_qty IS
  'Quantite a acheter pour obtenir un cadeau. 2 = « 2 achetes, 1 offert ».';

-- 043_cadeau_par_quantite.sql
COMMENT ON COLUMN promo_codes.gift_max IS
  'Nombre maximum de cadeaux par commande. NULL = repetition sans limite.';

-- 045_facturation_integrite.sql
-- ═══════════════════════════════════════════════════════════════
--  045 — Intégrité de la facturation
--
--  Deux protections que le code seul ne peut pas garantir :
--
--  1. UNICITÉ du numéro de pièce. La numérotation est calculée en
--     lisant le plus grand numéro existant : deux créations simultanées
--     pouvaient lire la même valeur et produire deux FAC-2026-0050.
--     L'index unique transforme cette course en erreur franche, que le
--     code rattrape en re-numérotant.
--
--  2. CHAÎNAGE cryptographique. Chaque facture finalisée porte
--     l'empreinte SHA-256 de son contenu ET de l'empreinte de la
--     facture précédente. Modifier ou supprimer une pièce après coup
--     casse toutes les empreintes suivantes : l'altération ne peut
--     plus être silencieuse. C'est le principe d'inaltérabilité de
--     l'art. 286-I-3° bis du CGI (la franchise en base en dispense
--     aujourd'hui, mais la dispense tombe avec la franchise — et un
--     historique inaltérable ne se construit pas rétroactivement).
--
--  Rejouable sans risque.
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. Numéro unique ──────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS invoices_number_unique ON invoices (number);

-- 045_facturation_integrite.sql
-- L'ordre de la chaîne est l'ordre de scellement.
CREATE INDEX IF NOT EXISTS invoices_finalized ON invoices (finalized_at);

-- 045_facturation_integrite.sql
COMMENT ON COLUMN invoices.chain_hash IS 'SHA-256 du contenu canonique + chain_prev — inaltérabilité (art. 286-I-3° bis CGI)';

-- 045_facturation_integrite.sql
COMMENT ON COLUMN invoices.chain_prev IS 'chain_hash de la pièce précédente, GENESIS pour la première';

-- 045_facturation_integrite.sql
COMMENT ON COLUMN invoices.finalized_at IS 'Scellement : après cette date, le contenu facturé ne change plus (avoir uniquement)';

-- 046_marque_dans_la_config.sql
COMMENT ON COLUMN white_label_config.legal_name IS 'Dénomination légale (ex. « EI Prénom Nom ») — figure sur les factures';

-- 046_marque_dans_la_config.sql
COMMENT ON COLUMN white_label_config.rcs_city   IS 'Ville du greffe RCS — mention de bas de facture';

-- 046_marque_dans_la_config.sql
COMMENT ON COLUMN white_label_config.shop_city  IS 'Ville de l''atelier/boutique — citée dans les emails clients';

-- 20260503_customer_profiles.sql
-- Allow service role full access (used by the backend)
ALTER TABLE customer_profiles ENABLE ROW LEVEL SECURITY;

-- 20260503_customer_profiles.sql
DROP POLICY IF EXISTS "service_role_all" ON customer_profiles;
CREATE POLICY "service_role_all" ON customer_profiles FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── Registre des migrations : une instance neuve naît à jour ───
CREATE TABLE IF NOT EXISTS schema_migrations (
  fichier TEXT PRIMARY KEY,
  applique_le TIMESTAMPTZ DEFAULT now(),
  checksum TEXT
);
ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY;
