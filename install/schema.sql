-- SCHEMA 736f67d251ad — généré le 2026-10-06 18:37
-- ═══════════════════════════════════════════════════════════════
--  SCHÉMA CONSOLIDÉ — instance neuve
--
--  GÉNÉRÉ par scripts/generer-schema.js (pg_dump de la base de
--  référence). NE PAS ÉDITER À LA MAIN : relancer le générateur.
--
--  52 tables · 1 vue(s) · 4 fonctions · 9 déclencheurs · 47 règles RLS · 48 index
--
--  Usage : sur un projet Supabase NEUF uniquement — SQL Editor (ou
--  Management API), puis install/seed.sql, puis scripts/installer.js.
-- ═══════════════════════════════════════════════════════════════

-- ─── Garde-fou : jamais sur une base qui contient déjà une boutique ───
DO $garde$
BEGIN
  IF to_regclass('public.products') IS NOT NULL THEN
    RAISE EXCEPTION 'Base non vierge : public.products existe déjà. Ce schéma ne s''applique que sur un projet Supabase NEUF.';
  END IF;
END
$garde$;

-- ─── Extensions (présentes par défaut sur Supabase ; sans effet sinon) ───
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.11
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: maj_note_produit(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.maj_note_produit() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE cible UUID;
BEGIN
  cible := COALESCE(NEW.product_id, OLD.product_id);
  UPDATE products p SET
    rating = COALESCE((SELECT ROUND(AVG(r.rating)::numeric,1) FROM product_reviews r
                       WHERE r.product_id = cible AND r.is_published), 0),
    reviews_count = COALESCE((SELECT COUNT(*) FROM product_reviews r
                       WHERE r.product_id = cible AND r.is_published), 0)
  WHERE p.id = cible;
  RETURN NULL;
END; $$;


--
-- Name: rls_auto_enable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rls_auto_enable() RETURNS event_trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
    $$;


--
-- Name: update_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: abandoned_carts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.abandoned_carts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_email text NOT NULL,
    customer_name text,
    cart_data jsonb DEFAULT '[]'::jsonb,
    cart_total numeric(10,2) DEFAULT 0,
    email_1_sent_at timestamp with time zone,
    email_2_sent_at timestamp with time zone,
    email_3_sent_at timestamp with time zone,
    recovered boolean DEFAULT false,
    recovered_at timestamp with time zone,
    order_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: accounting_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accounting_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    date date NOT NULL,
    type text NOT NULL,
    category text DEFAULT 'autre'::text,
    description text NOT NULL,
    amount numeric DEFAULT 0 NOT NULL,
    reference_type text,
    reference_id text,
    reference_number text,
    created_at timestamp with time zone DEFAULT now(),
    account_code text,
    counterparty_account text,
    journal text,
    piece text,
    receipt_url text,
    bank_transaction_id uuid,
    reconciled boolean DEFAULT false NOT NULL,
    is_personal boolean DEFAULT false NOT NULL,
    source text,
    confidence integer,
    sorted_at timestamp with time zone,
    period text,
    CONSTRAINT accounting_entries_type_check CHECK ((type = ANY (ARRAY['income'::text, 'expense'::text])))
);


--
-- Name: accounting_periods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accounting_periods (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    period text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    closed_at timestamp with time zone,
    closed_by text,
    stock_value numeric(12,2),
    meta jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT accounting_periods_status_check CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text])))
);


--
-- Name: accounting_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accounting_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    match_type text DEFAULT 'label_contains'::text NOT NULL,
    pattern text NOT NULL,
    direction text,
    category text NOT NULL,
    account_code text,
    is_personal boolean DEFAULT false NOT NULL,
    priority integer DEFAULT 0 NOT NULL,
    hits integer DEFAULT 0 NOT NULL,
    source text DEFAULT 'learned'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT accounting_rules_direction_check CHECK ((direction = ANY (ARRAY['in'::text, 'out'::text]))),
    CONSTRAINT accounting_rules_match_type_check CHECK ((match_type = ANY (ARRAY['label_contains'::text, 'counterparty'::text, 'amount'::text, 'regex'::text]))),
    CONSTRAINT accounting_rules_source_check CHECK ((source = ANY (ARRAY['seed'::text, 'manual'::text, 'learned'::text])))
);


--
-- Name: admin_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_profiles (
    id uuid NOT NULL,
    email text NOT NULL,
    full_name text,
    role text DEFAULT 'admin'::text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: bank_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bank_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    connection_id uuid,
    provider text DEFAULT 'gocardless'::text NOT NULL,
    external_id text NOT NULL,
    name text,
    short_code text,
    iban text,
    currency text DEFAULT 'EUR'::text NOT NULL,
    holder_name text,
    pcg_account text DEFAULT '512000'::text NOT NULL,
    balance numeric(12,2),
    balance_at timestamp with time zone,
    is_primary boolean DEFAULT false NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    meta jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT bank_accounts_status_check CHECK ((status = ANY (ARRAY['active'::text, 'expired'::text, 'error'::text, 'revoked'::text])))
);


--
-- Name: bank_connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bank_connections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider text DEFAULT 'gocardless'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    institution_id text,
    institution_name text,
    institution_logo text,
    requisition_id text,
    reference text,
    access_valid_until timestamp with time zone,
    last_sync_at timestamp with time zone,
    error_message text,
    meta jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT bank_connections_provider_check CHECK ((provider = ANY (ARRAY['gocardless'::text, 'stripe'::text, 'import'::text, 'manual'::text, 'bridge'::text]))),
    CONSTRAINT bank_connections_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'linked'::text, 'active'::text, 'expired'::text, 'error'::text, 'revoked'::text])))
);


--
-- Name: bank_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bank_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid,
    provider text DEFAULT 'gocardless'::text NOT NULL,
    external_id text NOT NULL,
    booking_date date NOT NULL,
    value_date date,
    amount numeric(12,2) NOT NULL,
    currency text DEFAULT 'EUR'::text NOT NULL,
    direction text DEFAULT 'out'::text NOT NULL,
    label text,
    counterparty text,
    status text DEFAULT 'booked'::text NOT NULL,
    category text,
    account_code text,
    confidence integer,
    match_kind text,
    match_hint text,
    matched_entry_id uuid,
    reconciled boolean DEFAULT false NOT NULL,
    reconciled_at timestamp with time zone,
    reconciled_by text,
    ignored boolean DEFAULT false NOT NULL,
    is_personal boolean DEFAULT false NOT NULL,
    is_split_parent boolean DEFAULT false NOT NULL,
    split_parent_id uuid,
    receipt_url text,
    period text,
    raw jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT bank_transactions_direction_check CHECK ((direction = ANY (ARRAY['in'::text, 'out'::text]))),
    CONSTRAINT bank_transactions_status_check CHECK ((status = ANY (ARRAY['booked'::text, 'pending'::text])))
);


--
-- Name: cart_recovery_offers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cart_recovery_offers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    week_start date NOT NULL,
    promo_code_id uuid,
    apply_to text DEFAULT 'r2'::text NOT NULL,
    message_fr text,
    message_en text,
    message_sv text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    gift_product_id uuid,
    CONSTRAINT cart_recovery_offers_apply_to_check CHECK ((apply_to = ANY (ARRAY['r1'::text, 'r2'::text, 'both'::text])))
);


--
-- Name: categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categories (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    slug text NOT NULL,
    emoji text DEFAULT '📦'::text NOT NULL,
    name_sv text NOT NULL,
    name_fr text NOT NULL,
    name_en text NOT NULL,
    sort_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    discount_type text,
    discount_value numeric(10,2),
    discount_start date,
    discount_end date,
    CONSTRAINT categories_discount_type_chk CHECK (((discount_type IS NULL) OR (discount_type = ANY (ARRAY['percent'::text, 'fixed'::text]))))
);


--
-- Name: cms_home; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cms_home (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    value_fr text,
    value_sv text,
    value_en text,
    type text DEFAULT 'text'::text,
    label text,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: cms_pages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cms_pages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
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
    nav_label_fr text DEFAULT ''::text,
    nav_label_sv text DEFAULT ''::text,
    nav_label_en text DEFAULT ''::text,
    hero_image text DEFAULT ''::text,
    hero_title_fr text DEFAULT ''::text,
    hero_title_sv text DEFAULT ''::text,
    hero_title_en text DEFAULT ''::text,
    hero_subtitle_fr text DEFAULT ''::text,
    hero_subtitle_sv text DEFAULT ''::text,
    hero_subtitle_en text DEFAULT ''::text,
    blocks jsonb DEFAULT '[]'::jsonb,
    is_active boolean DEFAULT true
);


--
-- Name: company_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_settings (
    key text NOT NULL,
    value text
);


--
-- Name: contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    type text DEFAULT 'client'::text NOT NULL,
    company text,
    first_name text,
    last_name text,
    email text,
    phone text,
    mobile text,
    address text,
    city text,
    zip text,
    country text DEFAULT 'France'::text,
    website text,
    siret text,
    tva_number text,
    notes text,
    tags text[] DEFAULT '{}'::text[],
    supabase_user_id uuid,
    total_orders numeric(10,2) DEFAULT 0,
    total_purchases numeric(10,2) DEFAULT 0,
    last_order_at timestamp with time zone,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    lead_time_days integer,
    free_shipping_sek numeric(10,2),
    min_order_sek numeric(10,2),
    lang text,
    CONSTRAINT contacts_lang_valide CHECK (((lang IS NULL) OR (lang = ANY (ARRAY['fr'::text, 'en'::text, 'sv'::text]))))
);


--
-- Name: crm_ao_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_ao_alerts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
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
    keywords_found text[],
    statut text DEFAULT 'nouvelle'::text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT crm_ao_alerts_statut_check CHECK ((statut = ANY (ARRAY['nouvelle'::text, 'vue'::text, 'intéressante'::text, 'non_pertinente'::text, 'répondue'::text])))
);


--
-- Name: customer_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contact_id uuid,
    supabase_user_id uuid,
    email text NOT NULL,
    first_name text,
    last_name text,
    shipping_address jsonb,
    billing_address jsonb,
    preferences jsonb DEFAULT '{}'::jsonb,
    newsletter boolean DEFAULT false,
    total_orders integer DEFAULT 0,
    total_spent numeric(10,2) DEFAULT 0,
    last_login_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: customer_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_profiles (
    email text NOT NULL,
    name text,
    phone text,
    address1 text,
    address2 text,
    city text,
    postal_code text,
    country text DEFAULT 'FR'::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: email_drafts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_drafts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    to_emails text,
    cc_emails text,
    subject text,
    body text,
    attachments jsonb DEFAULT '[]'::jsonb,
    in_reply_to text,
    imap_uid bigint,
    imap_folder text,
    updated_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: email_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    resend_email_id text,
    campaign_id uuid,
    to_email text,
    event_type text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: email_optouts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_optouts (
    email text NOT NULL,
    source text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: email_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_templates (
    key text NOT NULL,
    subject text,
    html text NOT NULL,
    updated_at timestamp with time zone DEFAULT now(),
    updated_by text,
    lang text DEFAULT 'fr'::text NOT NULL,
    CONSTRAINT email_templates_lang_valide CHECK ((lang = ANY (ARRAY['fr'::text, 'en'::text, 'sv'::text])))
);


--
-- Name: homepage_featured; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.homepage_featured (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    section text NOT NULL,
    product_id uuid,
    sort_order integer DEFAULT 0,
    is_active boolean DEFAULT true
);


--
-- Name: homepage_sections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.homepage_sections (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
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
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: inbox_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inbox_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    folder text DEFAULT 'INBOX'::text NOT NULL,
    uid bigint NOT NULL,
    uid_validity bigint,
    message_id text,
    from_name text,
    from_email text,
    to_emails text[],
    cc_emails text[],
    subject text,
    preview text,
    body_html text,
    body_text text,
    attachments jsonb DEFAULT '[]'::jsonb,
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
    has_attachment boolean GENERATED ALWAYS AS ((jsonb_array_length(COALESCE(attachments, '[]'::jsonb)) > 0)) STORED
);


--
-- Name: inbox_sync_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inbox_sync_state (
    folder text NOT NULL,
    uid_validity bigint,
    last_uid bigint DEFAULT 0,
    last_sync_at timestamp with time zone,
    last_error text,
    quota_used bigint,
    quota_total bigint
);


--
-- Name: invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    number text,
    date date,
    status text DEFAULT 'draft'::text,
    client_name text,
    client_address text,
    client_email text,
    note text,
    lines jsonb DEFAULT '[]'::jsonb,
    total_ht numeric(10,2) DEFAULT 0,
    total_tva numeric(10,2) DEFAULT 0,
    total_ttc numeric(10,2) DEFAULT 0,
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
    finalized_at timestamp with time zone
);


--
-- Name: landed_costs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.landed_costs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    reception_id uuid,
    description text NOT NULL,
    amount numeric NOT NULL,
    allocation_method text DEFAULT 'equal'::text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    lines jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: margin_products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.margin_products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    cat text,
    buy numeric(10,2) DEFAULT 0,
    trans numeric(10,2) DEFAULT 0,
    other numeric(10,2) DEFAULT 0,
    revient numeric(10,2) DEFAULT 0,
    sell numeric(10,2) DEFAULT 0,
    stock integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: marketing_automation_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketing_automation_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    automation_id uuid,
    automation_type text,
    recipient_email text NOT NULL,
    sent_at timestamp with time zone DEFAULT now()
);


--
-- Name: marketing_automations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketing_automations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    status text DEFAULT 'active'::text,
    delay_hours integer DEFAULT 24,
    subject text,
    custom_html text,
    sent_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: marketing_campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketing_campaigns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    status text DEFAULT 'draft'::text,
    subject text,
    content text,
    target_segment text DEFAULT 'all'::text,
    budget numeric(10,2) DEFAULT 0,
    spent numeric(10,2) DEFAULT 0,
    sent_count integer DEFAULT 0,
    open_count integer DEFAULT 0,
    click_count integer DEFAULT 0,
    conversion_count integer DEFAULT 0,
    revenue_generated numeric(10,2) DEFAULT 0,
    scheduled_at timestamp with time zone,
    started_at timestamp with time zone,
    ended_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    delivered_count integer DEFAULT 0,
    bounced_count integer DEFAULT 0
);


--
-- Name: media; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    filename text NOT NULL,
    url text NOT NULL,
    size integer,
    mime_type text,
    alt_text text,
    uploaded_at timestamp with time zone DEFAULT now()
);


--
-- Name: order_line_choices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_line_choices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    product_id uuid,
    line_ref text,
    line_name text NOT NULL,
    line_qty integer DEFAULT 1 NOT NULL,
    line_price numeric(10,2) DEFAULT 0 NOT NULL,
    options jsonb DEFAULT '[]'::jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    chosen_product_id uuid,
    chosen_label text,
    price_delta numeric(10,2),
    decided_at timestamp with time zone,
    sent_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    last_sent_at timestamp with time zone,
    relances integer DEFAULT 0 NOT NULL,
    last_send_error text,
    chosen_mix jsonb
);


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    order_number text NOT NULL,
    snipcart_token text,
    snipcart_invoice text,
    status text DEFAULT 'pending'::text NOT NULL,
    customer_name text,
    customer_email text,
    shipping_address jsonb DEFAULT '{}'::jsonb,
    billing_address jsonb DEFAULT '{}'::jsonb,
    lines jsonb DEFAULT '[]'::jsonb NOT NULL,
    subtotal numeric(10,2) DEFAULT 0,
    shipping numeric(10,2) DEFAULT 0,
    total numeric(10,2) DEFAULT 0,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tracking_number text,
    stripe_session_id text,
    invoice_number text,
    delivery_mode text DEFAULT 'delivery'::text,
    welcome_email_sent_at text,
    review_email_sent_at text,
    is_test boolean DEFAULT false NOT NULL,
    promo_code text,
    discount numeric(10,2) DEFAULT 0,
    relay_point_id text,
    relay_point_name text,
    relay_point_address text,
    relay_point_pays text DEFAULT 'FR'::text,
    mondial_relay_tracking text,
    mondial_relay_label_url text,
    transport_cost_real numeric(10,2) DEFAULT 0,
    packaging_cost numeric(10,2) DEFAULT 0,
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
    refunded_amount numeric(10,2) DEFAULT 0,
    refunded_at timestamp with time zone,
    refunds jsonb DEFAULT '[]'::jsonb,
    picking jsonb DEFAULT '{}'::jsonb,
    picked_at timestamp with time zone,
    lang text,
    shipping_country text,
    shipped_qty jsonb,
    last_shipment jsonb,
    backorder_at timestamp with time zone,
    relay_carrier_uuid text,
    recovery_token text,
    recovery_1_sent_at timestamp with time zone,
    recovery_2_sent_at timestamp with time zone,
    recovery_skip_reason text,
    recovered_at timestamp with time zone,
    recovered_order_id uuid,
    CONSTRAINT orders_lang_valide CHECK (((lang IS NULL) OR (lang = ANY (ARRAY['fr'::text, 'en'::text, 'sv'::text])))),
    CONSTRAINT orders_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'paid'::text, 'confirmed'::text, 'preparing'::text, 'partial'::text, 'shipped'::text, 'delivered'::text, 'cancelled'::text, 'refunded'::text, 'abandoned'::text])))
);


--
-- Name: product_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    order_id uuid,
    customer_name text,
    customer_email text,
    rating smallint NOT NULL,
    comment text,
    lang text DEFAULT 'fr'::text NOT NULL,
    is_published boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT product_reviews_rating_check CHECK (((rating >= 1) AND (rating <= 5)))
);


--
-- Name: product_suggestions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_suggestions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_name text NOT NULL,
    description text,
    source_url text,
    customer_email text,
    lang text DEFAULT 'fr'::text,
    status text DEFAULT 'new'::text,
    created_at timestamp with time zone DEFAULT now(),
    customer_name text
);


--
-- Name: product_suppliers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_suppliers (
    product_id uuid NOT NULL,
    supplier_id uuid NOT NULL,
    cost_eur numeric(10,4),
    cost_sek numeric(10,2),
    pack_size integer,
    times_bought integer DEFAULT 0 NOT NULL,
    last_bought_at timestamp with time zone,
    is_preferred boolean DEFAULT false NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: product_variants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_variants (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    product_id uuid,
    label text NOT NULL,
    price numeric(10,2) NOT NULL,
    is_default boolean DEFAULT false,
    sort_order integer DEFAULT 0
);


--
-- Name: product_velocity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_velocity (
    product_id uuid NOT NULL,
    units_sold integer DEFAULT 0 NOT NULL,
    days_in_stock integer DEFAULT 0 NOT NULL,
    days_window integer DEFAULT 0 NOT NULL,
    days_out integer DEFAULT 0 NOT NULL,
    weekly numeric(10,3) DEFAULT 0 NOT NULL,
    weekly_calendar numeric(10,3) DEFAULT 0 NOT NULL,
    computed_at timestamp with time zone DEFAULT now()
);


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
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
    price numeric(10,2) DEFAULT 0 NOT NULL,
    weight text,
    origin_sv text,
    origin_fr text,
    origin_en text,
    image_url text,
    badge text,
    is_bestseller boolean DEFAULT false,
    is_new boolean DEFAULT false,
    is_active boolean DEFAULT true,
    rating numeric(3,1) DEFAULT 4.5,
    reviews_count integer DEFAULT 0,
    tags text[] DEFAULT '{}'::text[],
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
    allergens_sv text DEFAULT ''::text,
    allergens_fr text DEFAULT ''::text,
    allergens_en text DEFAULT ''::text,
    nutrition jsonb DEFAULT '{}'::jsonb,
    extra_images jsonb DEFAULT '[]'::jsonb,
    cost_price numeric DEFAULT 0,
    pickup_only boolean DEFAULT false NOT NULL,
    reorder_qty integer,
    ean text,
    sku text,
    pack_size integer DEFAULT 1 NOT NULL,
    discount_type text,
    discount_value numeric(10,2),
    discount_start date,
    discount_end date,
    bundle_items jsonb,
    CONSTRAINT products_badge_check CHECK (((badge = ANY (ARRAY['badge-new'::text, 'badge-pop'::text, 'badge-org'::text, 'badge-must'::text])) OR (badge IS NULL))),
    CONSTRAINT products_discount_type_chk CHECK (((discount_type IS NULL) OR (discount_type = ANY (ARRAY['percent'::text, 'fixed'::text]))))
);


--
-- Name: promo_code_usages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.promo_code_usages (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    promo_code_id uuid NOT NULL,
    customer_email text NOT NULL,
    used_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: promo_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.promo_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    type text DEFAULT 'percent'::text,
    value numeric(10,2) NOT NULL,
    min_order numeric(10,2) DEFAULT 0,
    max_uses integer,
    used_count integer DEFAULT 0,
    valid_from date,
    valid_until date,
    is_active boolean DEFAULT true,
    campaign_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    single_use_per_customer boolean DEFAULT false NOT NULL,
    gift_product_ids jsonb DEFAULT '[]'::jsonb,
    gift_trigger_product_ids jsonb,
    gift_trigger_qty integer,
    gift_max integer
);


--
-- Name: purchase_order_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.purchase_order_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: purchase_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    number text NOT NULL,
    status text DEFAULT 'draft'::text,
    supplier_id uuid,
    supplier_name text,
    expected_date date,
    notes text,
    lines jsonb DEFAULT '[]'::jsonb,
    subtotal numeric(10,2) DEFAULT 0,
    tax numeric(10,2) DEFAULT 0,
    shipping numeric(10,2) DEFAULT 0,
    total numeric(10,2) DEFAULT 0,
    currency text DEFAULT 'EUR'::text,
    invoice_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    exchange_rate numeric,
    payment_date date,
    coverage_weeks integer,
    exchange_rate_used numeric(10,6)
);


--
-- Name: purchase_tickets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_tickets (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    store text,
    purchased_at date,
    currency text DEFAULT 'SEK'::text,
    exchange_rate numeric(12,6),
    vat_rate numeric(5,2) DEFAULT 12,
    total_ocr numeric(12,2),
    total_lines numeric(12,2),
    goods_eur_ht numeric(12,2),
    image_urls jsonb DEFAULT '[]'::jsonb,
    lines jsonb DEFAULT '[]'::jsonb,
    purchase_order_id uuid,
    reception_id uuid,
    status text DEFAULT 'draft'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: purchases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    supplier text NOT NULL,
    date date,
    ref text,
    status text DEFAULT 'received'::text,
    amount numeric(10,2) DEFAULT 0,
    transport numeric(10,2) DEFAULT 0,
    total numeric(10,2) DEFAULT 0,
    products text,
    notes text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: reception_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.reception_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: receptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.receptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    number text NOT NULL,
    purchase_order_id uuid,
    supplier_id uuid,
    supplier_name text,
    status text DEFAULT 'draft'::text,
    received_at timestamp with time zone DEFAULT now(),
    notes text,
    lines jsonb DEFAULT '[]'::jsonb,
    invoice_id uuid,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: reconciliations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reconciliations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    period text NOT NULL,
    account_id uuid,
    statement_balance numeric(12,2),
    book_balance numeric(12,2),
    gap numeric(12,2),
    pending jsonb DEFAULT '[]'::jsonb NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    signed_at timestamp with time zone,
    signed_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT reconciliations_status_check CHECK ((status = ANY (ARRAY['open'::text, 'signed'::text])))
);


--
-- Name: scheduled_emails; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scheduled_emails (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    to_emails text NOT NULL,
    cc_emails text,
    subject text NOT NULL,
    body text,
    attachments jsonb DEFAULT '[]'::jsonb,
    in_reply_to text,
    send_at timestamp with time zone NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    last_error text,
    sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    fichier text NOT NULL,
    applique_le timestamp with time zone DEFAULT now(),
    checksum text
);


--
-- Name: stock_movements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_movements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
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
    note text
);


--
-- Name: ticket_aliases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ticket_aliases (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    raw_label text NOT NULL,
    store text,
    product_id uuid,
    hits integer DEFAULT 1,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: v_campaign_stats; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_campaign_stats AS
 SELECT id,
    name,
    type,
    status,
    subject,
    content,
    target_segment,
    budget,
    spent,
    sent_count,
    open_count,
    click_count,
    conversion_count,
    revenue_generated,
    scheduled_at,
    started_at,
    ended_at,
    created_at,
    updated_at,
        CASE
            WHEN (sent_count > 0) THEN round((((open_count)::numeric / (sent_count)::numeric) * (100)::numeric), 1)
            ELSE (0)::numeric
        END AS open_rate,
        CASE
            WHEN (open_count > 0) THEN round((((click_count)::numeric / (open_count)::numeric) * (100)::numeric), 1)
            ELSE (0)::numeric
        END AS click_rate,
        CASE
            WHEN (spent > (0)::numeric) THEN round((revenue_generated / spent), 2)
            ELSE (0)::numeric
        END AS roas
   FROM public.marketing_campaigns mc;


--
-- Name: white_label_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.white_label_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    site_name text DEFAULT 'Mon Site'::text,
    site_slogan text,
    site_description text,
    logo_url text,
    favicon_url text,
    color_primary text DEFAULT '#3E5238'::text,
    color_secondary text DEFAULT '#9E5A3C'::text,
    color_bg text DEFAULT '#F6F1E9'::text,
    color_text text DEFAULT '#1C2028'::text,
    font_display text DEFAULT 'Cormorant Garamond'::text,
    font_body text DEFAULT 'Crimson Pro'::text,
    font_ui text DEFAULT 'Jost'::text,
    email text,
    phone text,
    address text,
    siret text,
    tva text,
    instagram text,
    facebook text,
    currency text DEFAULT 'EUR'::text,
    tva_rate numeric(5,2) DEFAULT 20,
    free_shipping_threshold numeric(10,2) DEFAULT 50,
    smtp_host text,
    smtp_port integer DEFAULT 587,
    smtp_user text,
    smtp_pass text,
    smtp_from text,
    stripe_public_key text,
    stripe_secret_key text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    pinterest text DEFAULT ''::text,
    announcement_fr text DEFAULT 'Livraison gratuite dès 50€ ·
  Produits authentiques · Paiement sécurisé'::text,
    announcement_sv text DEFAULT 'Fri frakt från 50€ · Autentiska
   produkter · Säker betalning'::text,
    announcement_en text DEFAULT 'Free delivery from €50 ·
  Authentic products · Secure payment'::text,
    footer_desc_fr text DEFAULT ''::text,
    footer_desc_sv text DEFAULT ''::text,
    footer_desc_en text DEFAULT ''::text,
    footer_tagline_fr text DEFAULT ''::text,
    footer_tagline_sv text DEFAULT ''::text,
    footer_tagline_en text DEFAULT ''::text,
    front_url text,
    ship_promo_active boolean DEFAULT false,
    ship_promo_threshold numeric(10,2),
    ship_promo_threshold_intl numeric(10,2),
    ship_promo_from date,
    ship_promo_until date,
    ship_promo_label_fr text,
    ship_promo_label_sv text,
    ship_promo_label_en text,
    legal_name text,
    rcs_city text,
    shop_city text
);


--
-- Name: abandoned_carts abandoned_carts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.abandoned_carts
    ADD CONSTRAINT abandoned_carts_pkey PRIMARY KEY (id);


--
-- Name: accounting_entries accounting_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounting_entries
    ADD CONSTRAINT accounting_entries_pkey PRIMARY KEY (id);


--
-- Name: accounting_periods accounting_periods_period_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounting_periods
    ADD CONSTRAINT accounting_periods_period_key UNIQUE (period);


--
-- Name: accounting_periods accounting_periods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounting_periods
    ADD CONSTRAINT accounting_periods_pkey PRIMARY KEY (id);


--
-- Name: accounting_rules accounting_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounting_rules
    ADD CONSTRAINT accounting_rules_pkey PRIMARY KEY (id);


--
-- Name: admin_profiles admin_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_profiles
    ADD CONSTRAINT admin_profiles_pkey PRIMARY KEY (id);


--
-- Name: bank_accounts bank_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_accounts
    ADD CONSTRAINT bank_accounts_pkey PRIMARY KEY (id);


--
-- Name: bank_connections bank_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_connections
    ADD CONSTRAINT bank_connections_pkey PRIMARY KEY (id);


--
-- Name: bank_transactions bank_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_transactions
    ADD CONSTRAINT bank_transactions_pkey PRIMARY KEY (id);


--
-- Name: cart_recovery_offers cart_recovery_offers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cart_recovery_offers
    ADD CONSTRAINT cart_recovery_offers_pkey PRIMARY KEY (id);


--
-- Name: cart_recovery_offers cart_recovery_offers_week_start_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cart_recovery_offers
    ADD CONSTRAINT cart_recovery_offers_week_start_key UNIQUE (week_start);


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);


--
-- Name: categories categories_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_slug_key UNIQUE (slug);


--
-- Name: cms_home cms_home_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_home
    ADD CONSTRAINT cms_home_key_key UNIQUE (key);


--
-- Name: cms_home cms_home_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_home
    ADD CONSTRAINT cms_home_pkey PRIMARY KEY (id);


--
-- Name: cms_pages cms_pages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_pages
    ADD CONSTRAINT cms_pages_pkey PRIMARY KEY (id);


--
-- Name: cms_pages cms_pages_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_pages
    ADD CONSTRAINT cms_pages_slug_key UNIQUE (slug);


--
-- Name: company_settings company_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_settings
    ADD CONSTRAINT company_settings_pkey PRIMARY KEY (key);


--
-- Name: contacts contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_pkey PRIMARY KEY (id);


--
-- Name: crm_ao_alerts crm_ao_alerts_boamp_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_ao_alerts
    ADD CONSTRAINT crm_ao_alerts_boamp_id_key UNIQUE (boamp_id);


--
-- Name: crm_ao_alerts crm_ao_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_ao_alerts
    ADD CONSTRAINT crm_ao_alerts_pkey PRIMARY KEY (id);


--
-- Name: customer_accounts customer_accounts_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_accounts
    ADD CONSTRAINT customer_accounts_email_key UNIQUE (email);


--
-- Name: customer_accounts customer_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_accounts
    ADD CONSTRAINT customer_accounts_pkey PRIMARY KEY (id);


--
-- Name: customer_accounts customer_accounts_supabase_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_accounts
    ADD CONSTRAINT customer_accounts_supabase_user_id_key UNIQUE (supabase_user_id);


--
-- Name: customer_profiles customer_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_profiles
    ADD CONSTRAINT customer_profiles_pkey PRIMARY KEY (email);


--
-- Name: email_drafts email_drafts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_drafts
    ADD CONSTRAINT email_drafts_pkey PRIMARY KEY (id);


--
-- Name: email_events email_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_events
    ADD CONSTRAINT email_events_pkey PRIMARY KEY (id);


--
-- Name: email_optouts email_optouts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_optouts
    ADD CONSTRAINT email_optouts_pkey PRIMARY KEY (email);


--
-- Name: email_templates email_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_pkey PRIMARY KEY (key);


--
-- Name: homepage_featured homepage_featured_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.homepage_featured
    ADD CONSTRAINT homepage_featured_pkey PRIMARY KEY (id);


--
-- Name: homepage_sections homepage_sections_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.homepage_sections
    ADD CONSTRAINT homepage_sections_key_key UNIQUE (key);


--
-- Name: homepage_sections homepage_sections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.homepage_sections
    ADD CONSTRAINT homepage_sections_pkey PRIMARY KEY (id);


--
-- Name: inbox_messages inbox_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbox_messages
    ADD CONSTRAINT inbox_messages_pkey PRIMARY KEY (id);


--
-- Name: inbox_sync_state inbox_sync_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbox_sync_state
    ADD CONSTRAINT inbox_sync_state_pkey PRIMARY KEY (folder);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: landed_costs landed_costs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landed_costs
    ADD CONSTRAINT landed_costs_pkey PRIMARY KEY (id);


--
-- Name: margin_products margin_products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.margin_products
    ADD CONSTRAINT margin_products_pkey PRIMARY KEY (id);


--
-- Name: marketing_automation_logs marketing_automation_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_automation_logs
    ADD CONSTRAINT marketing_automation_logs_pkey PRIMARY KEY (id);


--
-- Name: marketing_automations marketing_automations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_automations
    ADD CONSTRAINT marketing_automations_pkey PRIMARY KEY (id);


--
-- Name: marketing_campaigns marketing_campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_campaigns
    ADD CONSTRAINT marketing_campaigns_pkey PRIMARY KEY (id);


--
-- Name: media media_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media
    ADD CONSTRAINT media_pkey PRIMARY KEY (id);


--
-- Name: order_line_choices order_line_choices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_line_choices
    ADD CONSTRAINT order_line_choices_pkey PRIMARY KEY (id);


--
-- Name: orders orders_order_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_order_number_key UNIQUE (order_number);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: orders orders_snipcart_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_snipcart_token_key UNIQUE (snipcart_token);


--
-- Name: product_reviews product_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_reviews
    ADD CONSTRAINT product_reviews_pkey PRIMARY KEY (id);


--
-- Name: product_suggestions product_suggestions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_suggestions
    ADD CONSTRAINT product_suggestions_pkey PRIMARY KEY (id);


--
-- Name: product_suppliers product_suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_suppliers
    ADD CONSTRAINT product_suppliers_pkey PRIMARY KEY (product_id, supplier_id);


--
-- Name: product_variants product_variants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variants
    ADD CONSTRAINT product_variants_pkey PRIMARY KEY (id);


--
-- Name: product_velocity product_velocity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_velocity
    ADD CONSTRAINT product_velocity_pkey PRIMARY KEY (product_id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: promo_code_usages promo_code_usages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promo_code_usages
    ADD CONSTRAINT promo_code_usages_pkey PRIMARY KEY (id);


--
-- Name: promo_code_usages promo_code_usages_promo_code_id_customer_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promo_code_usages
    ADD CONSTRAINT promo_code_usages_promo_code_id_customer_email_key UNIQUE (promo_code_id, customer_email);


--
-- Name: promo_codes promo_codes_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promo_codes
    ADD CONSTRAINT promo_codes_code_key UNIQUE (code);


--
-- Name: promo_codes promo_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promo_codes
    ADD CONSTRAINT promo_codes_pkey PRIMARY KEY (id);


--
-- Name: purchase_orders purchase_orders_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_number_key UNIQUE (number);


--
-- Name: purchase_orders purchase_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_pkey PRIMARY KEY (id);


--
-- Name: purchase_tickets purchase_tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_tickets
    ADD CONSTRAINT purchase_tickets_pkey PRIMARY KEY (id);


--
-- Name: purchases purchases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchases
    ADD CONSTRAINT purchases_pkey PRIMARY KEY (id);


--
-- Name: receptions receptions_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receptions
    ADD CONSTRAINT receptions_number_key UNIQUE (number);


--
-- Name: receptions receptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receptions
    ADD CONSTRAINT receptions_pkey PRIMARY KEY (id);


--
-- Name: reconciliations reconciliations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reconciliations
    ADD CONSTRAINT reconciliations_pkey PRIMARY KEY (id);


--
-- Name: scheduled_emails scheduled_emails_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_emails
    ADD CONSTRAINT scheduled_emails_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (fichier);


--
-- Name: stock_movements stock_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_pkey PRIMARY KEY (id);


--
-- Name: ticket_aliases ticket_aliases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_aliases
    ADD CONSTRAINT ticket_aliases_pkey PRIMARY KEY (id);


--
-- Name: white_label_config white_label_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.white_label_config
    ADD CONSTRAINT white_label_config_pkey PRIMARY KEY (id);


--
-- Name: email_drafts_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_drafts_date ON public.email_drafts USING btree (updated_at DESC);


--
-- Name: email_templates_key_lang; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX email_templates_key_lang ON public.email_templates USING btree (key, lang);


--
-- Name: idx_accounting_banktx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_accounting_banktx ON public.accounting_entries USING btree (bank_transaction_id);


--
-- Name: idx_accounting_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_accounting_period ON public.accounting_entries USING btree (period);


--
-- Name: idx_accounting_ref; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_accounting_ref ON public.accounting_entries USING btree (reference_type, reference_id);


--
-- Name: idx_ao_alerts_boamp_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ao_alerts_boamp_id ON public.crm_ao_alerts USING btree (boamp_id);


--
-- Name: idx_ao_alerts_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ao_alerts_date ON public.crm_ao_alerts USING btree (date_publication DESC);


--
-- Name: idx_ao_alerts_statut; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ao_alerts_statut ON public.crm_ao_alerts USING btree (statut);


--
-- Name: idx_bank_account_conn; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bank_account_conn ON public.bank_accounts USING btree (connection_id);


--
-- Name: idx_bank_tx_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bank_tx_account ON public.bank_transactions USING btree (account_id);


--
-- Name: idx_bank_tx_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bank_tx_period ON public.bank_transactions USING btree (period);


--
-- Name: idx_bank_tx_reconciled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bank_tx_reconciled ON public.bank_transactions USING btree (reconciled) WHERE (reconciled = false);


--
-- Name: idx_bank_tx_split_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bank_tx_split_parent ON public.bank_transactions USING btree (split_parent_id);


--
-- Name: idx_email_events_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_events_campaign ON public.email_events USING btree (campaign_id);


--
-- Name: idx_orders_exclude_from_stats; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_exclude_from_stats ON public.orders USING btree (exclude_from_stats) WHERE (exclude_from_stats = true);


--
-- Name: idx_orders_is_test; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_is_test ON public.orders USING btree (is_test) WHERE (is_test = true);


--
-- Name: idx_promo_usages_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_promo_usages_email ON public.promo_code_usages USING btree (customer_email);


--
-- Name: idx_rules_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rules_priority ON public.accounting_rules USING btree (priority DESC);


--
-- Name: inbox_messages_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inbox_messages_date ON public.inbox_messages USING btree (folder, sent_at DESC);


--
-- Name: inbox_messages_from; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inbox_messages_from ON public.inbox_messages USING btree (from_email);


--
-- Name: inbox_messages_pj; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inbox_messages_pj ON public.inbox_messages USING btree (folder, sent_at DESC) WHERE has_attachment;


--
-- Name: inbox_messages_uid; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inbox_messages_uid ON public.inbox_messages USING btree (folder, uid);


--
-- Name: inbox_messages_unseen; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inbox_messages_unseen ON public.inbox_messages USING btree (folder) WHERE (seen = false);


--
-- Name: invoices_finalized; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invoices_finalized ON public.invoices USING btree (finalized_at);


--
-- Name: invoices_number_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX invoices_number_unique ON public.invoices USING btree (number);


--
-- Name: order_line_choices_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX order_line_choices_order ON public.order_line_choices USING btree (order_id, created_at DESC);


--
-- Name: order_line_choices_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX order_line_choices_status ON public.order_line_choices USING btree (status) WHERE (status = 'pending'::text);


--
-- Name: orders_backorder; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_backorder ON public.orders USING btree (status) WHERE (status = 'partial'::text);


--
-- Name: orders_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_created_at_idx ON public.orders USING btree (created_at DESC);


--
-- Name: orders_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_email_idx ON public.orders USING btree (customer_email);


--
-- Name: orders_relance_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_relance_idx ON public.orders USING btree (status, created_at) WHERE (status = ANY (ARRAY['pending'::text, 'abandoned'::text]));


--
-- Name: orders_snipcart_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_snipcart_token_idx ON public.orders USING btree (snipcart_token);


--
-- Name: orders_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_status_idx ON public.orders USING btree (status);


--
-- Name: orders_stripe_session_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_stripe_session_idx ON public.orders USING btree (stripe_session_id);


--
-- Name: product_reviews_produit; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_reviews_produit ON public.product_reviews USING btree (product_id, is_published, created_at DESC);


--
-- Name: product_reviews_unique_par_commande; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX product_reviews_unique_par_commande ON public.product_reviews USING btree (product_id, order_id) WHERE (order_id IS NOT NULL);


--
-- Name: product_suppliers_prod; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_suppliers_prod ON public.product_suppliers USING btree (product_id);


--
-- Name: product_suppliers_sup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_suppliers_sup ON public.product_suppliers USING btree (supplier_id);


--
-- Name: products_ean_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX products_ean_unique ON public.products USING btree (ean) WHERE ((ean IS NOT NULL) AND (ean <> ''::text));


--
-- Name: products_sku_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX products_sku_unique ON public.products USING btree (sku) WHERE (sku IS NOT NULL);


--
-- Name: scheduled_emails_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX scheduled_emails_due ON public.scheduled_emails USING btree (send_at) WHERE (status = 'pending'::text);


--
-- Name: stock_movements_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_movements_order ON public.stock_movements USING btree (order_id, product_id);


--
-- Name: stock_movements_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_movements_product ON public.stock_movements USING btree (product_id, created_at DESC);


--
-- Name: ticket_aliases_label_store; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ticket_aliases_label_store ON public.ticket_aliases USING btree (lower(raw_label), COALESCE(store, ''::text));


--
-- Name: uniq_accounting_entry_ref; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_accounting_entry_ref ON public.accounting_entries USING btree (reference_type, reference_id, type, COALESCE(category, ''::text)) WHERE (reference_id IS NOT NULL);


--
-- Name: uniq_bank_account_ext; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_bank_account_ext ON public.bank_accounts USING btree (provider, external_id);


--
-- Name: uniq_bank_tx_ext; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_bank_tx_ext ON public.bank_transactions USING btree (provider, external_id);


--
-- Name: uniq_reconciliation_period; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_reconciliation_period ON public.reconciliations USING btree (period, COALESCE(account_id, '00000000-0000-0000-0000-000000000000'::uuid));


--
-- Name: homepage_sections homepage_sections_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER homepage_sections_updated_at BEFORE UPDATE ON public.homepage_sections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: orders orders_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: products products_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: accounting_rules trg_accounting_rules_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_accounting_rules_updated BEFORE UPDATE ON public.accounting_rules FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: bank_accounts trg_bank_accounts_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_bank_accounts_updated BEFORE UPDATE ON public.bank_accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: bank_connections trg_bank_connections_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_bank_connections_updated BEFORE UPDATE ON public.bank_connections FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: bank_transactions trg_bank_transactions_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_bank_transactions_updated BEFORE UPDATE ON public.bank_transactions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: product_reviews trg_maj_note_produit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_maj_note_produit AFTER INSERT OR DELETE OR UPDATE ON public.product_reviews FOR EACH ROW EXECUTE FUNCTION public.maj_note_produit();


--
-- Name: reconciliations trg_reconciliations_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_reconciliations_updated BEFORE UPDATE ON public.reconciliations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: accounting_entries accounting_entries_bank_tx_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounting_entries
    ADD CONSTRAINT accounting_entries_bank_tx_fk FOREIGN KEY (bank_transaction_id) REFERENCES public.bank_transactions(id) ON DELETE SET NULL;


--
-- Name: admin_profiles admin_profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_profiles
    ADD CONSTRAINT admin_profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: bank_accounts bank_accounts_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_accounts
    ADD CONSTRAINT bank_accounts_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES public.bank_connections(id) ON DELETE CASCADE;


--
-- Name: bank_transactions bank_transactions_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_transactions
    ADD CONSTRAINT bank_transactions_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.bank_accounts(id) ON DELETE CASCADE;


--
-- Name: bank_transactions bank_transactions_matched_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_transactions
    ADD CONSTRAINT bank_transactions_matched_entry_id_fkey FOREIGN KEY (matched_entry_id) REFERENCES public.accounting_entries(id) ON DELETE SET NULL;


--
-- Name: bank_transactions bank_transactions_split_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_transactions
    ADD CONSTRAINT bank_transactions_split_parent_id_fkey FOREIGN KEY (split_parent_id) REFERENCES public.bank_transactions(id) ON DELETE SET NULL;


--
-- Name: cart_recovery_offers cart_recovery_offers_gift_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cart_recovery_offers
    ADD CONSTRAINT cart_recovery_offers_gift_product_id_fkey FOREIGN KEY (gift_product_id) REFERENCES public.products(id) ON DELETE SET NULL;


--
-- Name: cart_recovery_offers cart_recovery_offers_promo_code_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cart_recovery_offers
    ADD CONSTRAINT cart_recovery_offers_promo_code_id_fkey FOREIGN KEY (promo_code_id) REFERENCES public.promo_codes(id) ON DELETE SET NULL;


--
-- Name: customer_accounts customer_accounts_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_accounts
    ADD CONSTRAINT customer_accounts_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id);


--
-- Name: homepage_featured homepage_featured_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.homepage_featured
    ADD CONSTRAINT homepage_featured_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: landed_costs landed_costs_reception_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landed_costs
    ADD CONSTRAINT landed_costs_reception_id_fkey FOREIGN KEY (reception_id) REFERENCES public.receptions(id);


--
-- Name: order_line_choices order_line_choices_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_line_choices
    ADD CONSTRAINT order_line_choices_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: product_reviews product_reviews_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_reviews
    ADD CONSTRAINT product_reviews_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: product_reviews product_reviews_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_reviews
    ADD CONSTRAINT product_reviews_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_suppliers product_suppliers_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_suppliers
    ADD CONSTRAINT product_suppliers_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_suppliers product_suppliers_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_suppliers
    ADD CONSTRAINT product_suppliers_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: product_variants product_variants_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variants
    ADD CONSTRAINT product_variants_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_velocity product_velocity_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_velocity
    ADD CONSTRAINT product_velocity_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: products products_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE SET NULL;


--
-- Name: promo_code_usages promo_code_usages_promo_code_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promo_code_usages
    ADD CONSTRAINT promo_code_usages_promo_code_id_fkey FOREIGN KEY (promo_code_id) REFERENCES public.promo_codes(id) ON DELETE CASCADE;


--
-- Name: promo_codes promo_codes_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promo_codes
    ADD CONSTRAINT promo_codes_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.marketing_campaigns(id);


--
-- Name: purchase_orders purchase_orders_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.purchases(id);


--
-- Name: purchase_orders purchase_orders_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.contacts(id);


--
-- Name: receptions receptions_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receptions
    ADD CONSTRAINT receptions_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.purchases(id);


--
-- Name: receptions receptions_purchase_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receptions
    ADD CONSTRAINT receptions_purchase_order_id_fkey FOREIGN KEY (purchase_order_id) REFERENCES public.purchase_orders(id);


--
-- Name: receptions receptions_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receptions
    ADD CONSTRAINT receptions_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.contacts(id);


--
-- Name: reconciliations reconciliations_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reconciliations
    ADD CONSTRAINT reconciliations_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.bank_accounts(id) ON DELETE SET NULL;


--
-- Name: stock_movements stock_movements_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: ticket_aliases ticket_aliases_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_aliases
    ADD CONSTRAINT ticket_aliases_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: abandoned_carts Admin abandoned; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin abandoned" ON public.abandoned_carts USING ((auth.role() = 'authenticated'::text));


--
-- Name: cms_pages Admin cms_pages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin cms_pages" ON public.cms_pages USING ((auth.role() = 'authenticated'::text));


--
-- Name: contacts Admin contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin contacts" ON public.contacts USING ((auth.role() = 'authenticated'::text));


--
-- Name: customer_accounts Admin customers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin customers" ON public.customer_accounts USING ((auth.role() = 'authenticated'::text));


--
-- Name: marketing_campaigns Admin marketing; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin marketing" ON public.marketing_campaigns USING ((auth.role() = 'authenticated'::text));


--
-- Name: promo_codes Admin promo; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin promo" ON public.promo_codes USING ((auth.role() = 'authenticated'::text));


--
-- Name: purchase_orders Admin purchase_orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin purchase_orders" ON public.purchase_orders USING ((auth.role() = 'authenticated'::text));


--
-- Name: receptions Admin receptions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin receptions" ON public.receptions USING ((auth.role() = 'authenticated'::text));


--
-- Name: stock_movements Admin stock; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin stock" ON public.stock_movements USING ((auth.role() = 'authenticated'::text));


--
-- Name: white_label_config Admin wl; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin wl" ON public.white_label_config USING ((auth.role() = 'authenticated'::text));


--
-- Name: cms_home Admin write cms_home; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin write cms_home" ON public.cms_home USING ((auth.role() = 'authenticated'::text));


--
-- Name: cms_pages Public cms_pages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public cms_pages" ON public.cms_pages FOR SELECT USING ((is_published = true));


--
-- Name: promo_codes Public promo check; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public promo check" ON public.promo_codes FOR SELECT USING ((is_active = true));


--
-- Name: cms_home Public read cms_home; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public read cms_home" ON public.cms_home FOR SELECT USING (true);


--
-- Name: abandoned_carts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.abandoned_carts ENABLE ROW LEVEL SECURITY;

--
-- Name: accounting_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.accounting_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: accounting_periods; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.accounting_periods ENABLE ROW LEVEL SECURITY;

--
-- Name: accounting_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.accounting_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: accounting_entries admin_accounting; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_accounting ON public.accounting_entries USING ((auth.role() = 'authenticated'::text));


--
-- Name: accounting_periods admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_all ON public.accounting_periods USING ((auth.role() = 'authenticated'::text));


--
-- Name: accounting_rules admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_all ON public.accounting_rules USING ((auth.role() = 'authenticated'::text));


--
-- Name: bank_accounts admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_all ON public.bank_accounts USING ((auth.role() = 'authenticated'::text));


--
-- Name: bank_connections admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_all ON public.bank_connections USING ((auth.role() = 'authenticated'::text));


--
-- Name: bank_transactions admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_all ON public.bank_transactions USING ((auth.role() = 'authenticated'::text));


--
-- Name: reconciliations admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_all ON public.reconciliations USING ((auth.role() = 'authenticated'::text));


--
-- Name: categories admin_all_categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_all_categories ON public.categories USING ((auth.role() = 'authenticated'::text));


--
-- Name: homepage_featured admin_all_featured; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_all_featured ON public.homepage_featured USING ((auth.role() = 'authenticated'::text));


--
-- Name: homepage_sections admin_all_homepage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_all_homepage ON public.homepage_sections USING ((auth.role() = 'authenticated'::text));


--
-- Name: media admin_all_media; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_all_media ON public.media USING ((auth.role() = 'authenticated'::text));


--
-- Name: orders admin_all_orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_all_orders ON public.orders USING ((auth.role() = 'authenticated'::text));


--
-- Name: products admin_all_products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_all_products ON public.products USING ((auth.role() = 'authenticated'::text));


--
-- Name: product_variants admin_all_variants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_all_variants ON public.product_variants USING ((auth.role() = 'authenticated'::text));


--
-- Name: email_drafts admin_email_drafts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_email_drafts ON public.email_drafts USING ((auth.role() = 'authenticated'::text));


--
-- Name: email_templates admin_email_templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_email_templates ON public.email_templates USING ((auth.role() = 'authenticated'::text));


--
-- Name: inbox_messages admin_inbox_messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_inbox_messages ON public.inbox_messages USING ((auth.role() = 'authenticated'::text));


--
-- Name: inbox_sync_state admin_inbox_sync_state; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_inbox_sync_state ON public.inbox_sync_state USING ((auth.role() = 'authenticated'::text));


--
-- Name: order_line_choices admin_order_line_choices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_order_line_choices ON public.order_line_choices USING ((auth.role() = 'authenticated'::text));


--
-- Name: admin_profiles admin_own_profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_own_profile ON public.admin_profiles USING ((auth.uid() = id));


--
-- Name: product_suppliers admin_product_suppliers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_product_suppliers ON public.product_suppliers USING ((auth.role() = 'authenticated'::text));


--
-- Name: product_velocity admin_product_velocity; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_product_velocity ON public.product_velocity USING ((auth.role() = 'authenticated'::text));


--
-- Name: admin_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: purchase_tickets admin_purchase_tickets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_purchase_tickets ON public.purchase_tickets USING ((auth.role() = 'authenticated'::text));


--
-- Name: scheduled_emails admin_scheduled_emails; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_scheduled_emails ON public.scheduled_emails USING ((auth.role() = 'authenticated'::text));


--
-- Name: stock_movements admin_stock_movements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_stock_movements ON public.stock_movements USING ((auth.role() = 'authenticated'::text));


--
-- Name: ticket_aliases admin_ticket_aliases; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_ticket_aliases ON public.ticket_aliases USING ((auth.role() = 'authenticated'::text));


--
-- Name: bank_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: bank_connections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bank_connections ENABLE ROW LEVEL SECURITY;

--
-- Name: bank_transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: cart_recovery_offers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cart_recovery_offers ENABLE ROW LEVEL SECURITY;

--
-- Name: categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

--
-- Name: cms_home; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cms_home ENABLE ROW LEVEL SECURITY;

--
-- Name: cms_pages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cms_pages ENABLE ROW LEVEL SECURITY;

--
-- Name: company_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_ao_alerts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_ao_alerts ENABLE ROW LEVEL SECURITY;

--
-- Name: customer_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customer_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: customer_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customer_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: email_drafts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_drafts ENABLE ROW LEVEL SECURITY;

--
-- Name: email_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;

--
-- Name: email_optouts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_optouts ENABLE ROW LEVEL SECURITY;

--
-- Name: email_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: homepage_featured; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.homepage_featured ENABLE ROW LEVEL SECURITY;

--
-- Name: homepage_sections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.homepage_sections ENABLE ROW LEVEL SECURITY;

--
-- Name: inbox_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inbox_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: inbox_sync_state; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inbox_sync_state ENABLE ROW LEVEL SECURITY;

--
-- Name: invoices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

--
-- Name: landed_costs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.landed_costs ENABLE ROW LEVEL SECURITY;

--
-- Name: margin_products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.margin_products ENABLE ROW LEVEL SECURITY;

--
-- Name: marketing_automation_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.marketing_automation_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: marketing_automations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.marketing_automations ENABLE ROW LEVEL SECURITY;

--
-- Name: marketing_campaigns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.marketing_campaigns ENABLE ROW LEVEL SECURITY;

--
-- Name: media; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.media ENABLE ROW LEVEL SECURITY;

--
-- Name: order_line_choices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_line_choices ENABLE ROW LEVEL SECURITY;

--
-- Name: orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

--
-- Name: product_reviews; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;

--
-- Name: product_suggestions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_suggestions ENABLE ROW LEVEL SECURITY;

--
-- Name: product_suppliers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_suppliers ENABLE ROW LEVEL SECURITY;

--
-- Name: product_variants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;

--
-- Name: product_velocity; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_velocity ENABLE ROW LEVEL SECURITY;

--
-- Name: products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

--
-- Name: promo_code_usages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.promo_code_usages ENABLE ROW LEVEL SECURITY;

--
-- Name: promo_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;

--
-- Name: categories public_read_categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY public_read_categories ON public.categories FOR SELECT USING ((is_active = true));


--
-- Name: homepage_featured public_read_featured; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY public_read_featured ON public.homepage_featured FOR SELECT USING ((is_active = true));


--
-- Name: homepage_sections public_read_homepage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY public_read_homepage ON public.homepage_sections FOR SELECT USING ((is_active = true));


--
-- Name: products public_read_products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY public_read_products ON public.products FOR SELECT USING ((is_active = true));


--
-- Name: product_variants public_read_variants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY public_read_variants ON public.product_variants FOR SELECT USING (true);


--
-- Name: purchase_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: purchase_tickets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.purchase_tickets ENABLE ROW LEVEL SECURITY;

--
-- Name: purchases; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;

--
-- Name: receptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.receptions ENABLE ROW LEVEL SECURITY;

--
-- Name: reconciliations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reconciliations ENABLE ROW LEVEL SECURITY;

--
-- Name: scheduled_emails; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.scheduled_emails ENABLE ROW LEVEL SECURITY;

--
-- Name: schema_migrations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;

--
-- Name: customer_profiles service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.customer_profiles TO service_role USING (true) WITH CHECK (true);


--
-- Name: product_reviews service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.product_reviews TO service_role USING (true) WITH CHECK (true);


--
-- Name: stock_movements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

--
-- Name: ticket_aliases; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ticket_aliases ENABLE ROW LEVEL SECURITY;

--
-- Name: white_label_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.white_label_config ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION maj_note_produit(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.maj_note_produit() TO anon;
GRANT ALL ON FUNCTION public.maj_note_produit() TO authenticated;
GRANT ALL ON FUNCTION public.maj_note_produit() TO service_role;


--
-- Name: FUNCTION rls_auto_enable(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.rls_auto_enable() TO anon;
GRANT ALL ON FUNCTION public.rls_auto_enable() TO authenticated;
GRANT ALL ON FUNCTION public.rls_auto_enable() TO service_role;


--
-- Name: FUNCTION set_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_updated_at() TO service_role;


--
-- Name: FUNCTION update_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_updated_at() TO anon;
GRANT ALL ON FUNCTION public.update_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.update_updated_at() TO service_role;


--
-- Name: TABLE abandoned_carts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.abandoned_carts TO anon;
GRANT ALL ON TABLE public.abandoned_carts TO authenticated;
GRANT ALL ON TABLE public.abandoned_carts TO service_role;


--
-- Name: TABLE accounting_entries; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.accounting_entries TO anon;
GRANT ALL ON TABLE public.accounting_entries TO authenticated;
GRANT ALL ON TABLE public.accounting_entries TO service_role;


--
-- Name: TABLE accounting_periods; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.accounting_periods TO anon;
GRANT ALL ON TABLE public.accounting_periods TO authenticated;
GRANT ALL ON TABLE public.accounting_periods TO service_role;


--
-- Name: TABLE accounting_rules; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.accounting_rules TO anon;
GRANT ALL ON TABLE public.accounting_rules TO authenticated;
GRANT ALL ON TABLE public.accounting_rules TO service_role;


--
-- Name: TABLE admin_profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.admin_profiles TO anon;
GRANT ALL ON TABLE public.admin_profiles TO authenticated;
GRANT ALL ON TABLE public.admin_profiles TO service_role;


--
-- Name: TABLE bank_accounts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.bank_accounts TO anon;
GRANT ALL ON TABLE public.bank_accounts TO authenticated;
GRANT ALL ON TABLE public.bank_accounts TO service_role;


--
-- Name: TABLE bank_connections; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.bank_connections TO anon;
GRANT ALL ON TABLE public.bank_connections TO authenticated;
GRANT ALL ON TABLE public.bank_connections TO service_role;


--
-- Name: TABLE bank_transactions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.bank_transactions TO anon;
GRANT ALL ON TABLE public.bank_transactions TO authenticated;
GRANT ALL ON TABLE public.bank_transactions TO service_role;


--
-- Name: TABLE cart_recovery_offers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.cart_recovery_offers TO anon;
GRANT ALL ON TABLE public.cart_recovery_offers TO authenticated;
GRANT ALL ON TABLE public.cart_recovery_offers TO service_role;


--
-- Name: TABLE categories; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.categories TO anon;
GRANT ALL ON TABLE public.categories TO authenticated;
GRANT ALL ON TABLE public.categories TO service_role;


--
-- Name: TABLE cms_home; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.cms_home TO anon;
GRANT ALL ON TABLE public.cms_home TO authenticated;
GRANT ALL ON TABLE public.cms_home TO service_role;


--
-- Name: TABLE cms_pages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.cms_pages TO anon;
GRANT ALL ON TABLE public.cms_pages TO authenticated;
GRANT ALL ON TABLE public.cms_pages TO service_role;


--
-- Name: TABLE company_settings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.company_settings TO anon;
GRANT ALL ON TABLE public.company_settings TO authenticated;
GRANT ALL ON TABLE public.company_settings TO service_role;


--
-- Name: TABLE contacts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.contacts TO anon;
GRANT ALL ON TABLE public.contacts TO authenticated;
GRANT ALL ON TABLE public.contacts TO service_role;


--
-- Name: TABLE crm_ao_alerts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.crm_ao_alerts TO anon;
GRANT ALL ON TABLE public.crm_ao_alerts TO authenticated;
GRANT ALL ON TABLE public.crm_ao_alerts TO service_role;


--
-- Name: TABLE customer_accounts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.customer_accounts TO anon;
GRANT ALL ON TABLE public.customer_accounts TO authenticated;
GRANT ALL ON TABLE public.customer_accounts TO service_role;


--
-- Name: TABLE customer_profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.customer_profiles TO anon;
GRANT ALL ON TABLE public.customer_profiles TO authenticated;
GRANT ALL ON TABLE public.customer_profiles TO service_role;


--
-- Name: TABLE email_drafts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.email_drafts TO anon;
GRANT ALL ON TABLE public.email_drafts TO authenticated;
GRANT ALL ON TABLE public.email_drafts TO service_role;


--
-- Name: TABLE email_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.email_events TO anon;
GRANT ALL ON TABLE public.email_events TO authenticated;
GRANT ALL ON TABLE public.email_events TO service_role;


--
-- Name: TABLE email_optouts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.email_optouts TO anon;
GRANT ALL ON TABLE public.email_optouts TO authenticated;
GRANT ALL ON TABLE public.email_optouts TO service_role;


--
-- Name: TABLE email_templates; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.email_templates TO anon;
GRANT ALL ON TABLE public.email_templates TO authenticated;
GRANT ALL ON TABLE public.email_templates TO service_role;


--
-- Name: TABLE homepage_featured; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.homepage_featured TO anon;
GRANT ALL ON TABLE public.homepage_featured TO authenticated;
GRANT ALL ON TABLE public.homepage_featured TO service_role;


--
-- Name: TABLE homepage_sections; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.homepage_sections TO anon;
GRANT ALL ON TABLE public.homepage_sections TO authenticated;
GRANT ALL ON TABLE public.homepage_sections TO service_role;


--
-- Name: TABLE inbox_messages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.inbox_messages TO anon;
GRANT ALL ON TABLE public.inbox_messages TO authenticated;
GRANT ALL ON TABLE public.inbox_messages TO service_role;


--
-- Name: TABLE inbox_sync_state; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.inbox_sync_state TO anon;
GRANT ALL ON TABLE public.inbox_sync_state TO authenticated;
GRANT ALL ON TABLE public.inbox_sync_state TO service_role;


--
-- Name: TABLE invoices; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.invoices TO anon;
GRANT ALL ON TABLE public.invoices TO authenticated;
GRANT ALL ON TABLE public.invoices TO service_role;


--
-- Name: TABLE landed_costs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.landed_costs TO anon;
GRANT ALL ON TABLE public.landed_costs TO authenticated;
GRANT ALL ON TABLE public.landed_costs TO service_role;


--
-- Name: TABLE margin_products; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.margin_products TO anon;
GRANT ALL ON TABLE public.margin_products TO authenticated;
GRANT ALL ON TABLE public.margin_products TO service_role;


--
-- Name: TABLE marketing_automation_logs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.marketing_automation_logs TO anon;
GRANT ALL ON TABLE public.marketing_automation_logs TO authenticated;
GRANT ALL ON TABLE public.marketing_automation_logs TO service_role;


--
-- Name: TABLE marketing_automations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.marketing_automations TO anon;
GRANT ALL ON TABLE public.marketing_automations TO authenticated;
GRANT ALL ON TABLE public.marketing_automations TO service_role;


--
-- Name: TABLE marketing_campaigns; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.marketing_campaigns TO anon;
GRANT ALL ON TABLE public.marketing_campaigns TO authenticated;
GRANT ALL ON TABLE public.marketing_campaigns TO service_role;


--
-- Name: TABLE media; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.media TO anon;
GRANT ALL ON TABLE public.media TO authenticated;
GRANT ALL ON TABLE public.media TO service_role;


--
-- Name: TABLE order_line_choices; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.order_line_choices TO anon;
GRANT ALL ON TABLE public.order_line_choices TO authenticated;
GRANT ALL ON TABLE public.order_line_choices TO service_role;


--
-- Name: TABLE orders; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.orders TO anon;
GRANT ALL ON TABLE public.orders TO authenticated;
GRANT ALL ON TABLE public.orders TO service_role;


--
-- Name: TABLE product_reviews; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.product_reviews TO anon;
GRANT ALL ON TABLE public.product_reviews TO authenticated;
GRANT ALL ON TABLE public.product_reviews TO service_role;


--
-- Name: TABLE product_suggestions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.product_suggestions TO anon;
GRANT ALL ON TABLE public.product_suggestions TO authenticated;
GRANT ALL ON TABLE public.product_suggestions TO service_role;


--
-- Name: TABLE product_suppliers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.product_suppliers TO anon;
GRANT ALL ON TABLE public.product_suppliers TO authenticated;
GRANT ALL ON TABLE public.product_suppliers TO service_role;


--
-- Name: TABLE product_variants; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.product_variants TO anon;
GRANT ALL ON TABLE public.product_variants TO authenticated;
GRANT ALL ON TABLE public.product_variants TO service_role;


--
-- Name: TABLE product_velocity; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.product_velocity TO anon;
GRANT ALL ON TABLE public.product_velocity TO authenticated;
GRANT ALL ON TABLE public.product_velocity TO service_role;


--
-- Name: TABLE products; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.products TO anon;
GRANT ALL ON TABLE public.products TO authenticated;
GRANT ALL ON TABLE public.products TO service_role;


--
-- Name: TABLE promo_code_usages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.promo_code_usages TO anon;
GRANT ALL ON TABLE public.promo_code_usages TO authenticated;
GRANT ALL ON TABLE public.promo_code_usages TO service_role;


--
-- Name: TABLE promo_codes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.promo_codes TO anon;
GRANT ALL ON TABLE public.promo_codes TO authenticated;
GRANT ALL ON TABLE public.promo_codes TO service_role;


--
-- Name: SEQUENCE purchase_order_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.purchase_order_seq TO anon;
GRANT ALL ON SEQUENCE public.purchase_order_seq TO authenticated;
GRANT ALL ON SEQUENCE public.purchase_order_seq TO service_role;


--
-- Name: TABLE purchase_orders; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.purchase_orders TO anon;
GRANT ALL ON TABLE public.purchase_orders TO authenticated;
GRANT ALL ON TABLE public.purchase_orders TO service_role;


--
-- Name: TABLE purchase_tickets; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.purchase_tickets TO anon;
GRANT ALL ON TABLE public.purchase_tickets TO authenticated;
GRANT ALL ON TABLE public.purchase_tickets TO service_role;


--
-- Name: TABLE purchases; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.purchases TO anon;
GRANT ALL ON TABLE public.purchases TO authenticated;
GRANT ALL ON TABLE public.purchases TO service_role;


--
-- Name: SEQUENCE reception_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.reception_seq TO anon;
GRANT ALL ON SEQUENCE public.reception_seq TO authenticated;
GRANT ALL ON SEQUENCE public.reception_seq TO service_role;


--
-- Name: TABLE receptions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.receptions TO anon;
GRANT ALL ON TABLE public.receptions TO authenticated;
GRANT ALL ON TABLE public.receptions TO service_role;


--
-- Name: TABLE reconciliations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.reconciliations TO anon;
GRANT ALL ON TABLE public.reconciliations TO authenticated;
GRANT ALL ON TABLE public.reconciliations TO service_role;


--
-- Name: TABLE scheduled_emails; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.scheduled_emails TO anon;
GRANT ALL ON TABLE public.scheduled_emails TO authenticated;
GRANT ALL ON TABLE public.scheduled_emails TO service_role;


--
-- Name: TABLE schema_migrations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.schema_migrations TO anon;
GRANT ALL ON TABLE public.schema_migrations TO authenticated;
GRANT ALL ON TABLE public.schema_migrations TO service_role;


--
-- Name: TABLE stock_movements; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.stock_movements TO anon;
GRANT ALL ON TABLE public.stock_movements TO authenticated;
GRANT ALL ON TABLE public.stock_movements TO service_role;


--
-- Name: TABLE ticket_aliases; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.ticket_aliases TO anon;
GRANT ALL ON TABLE public.ticket_aliases TO authenticated;
GRANT ALL ON TABLE public.ticket_aliases TO service_role;


--
-- Name: TABLE v_campaign_stats; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.v_campaign_stats TO anon;
GRANT ALL ON TABLE public.v_campaign_stats TO authenticated;
GRANT ALL ON TABLE public.v_campaign_stats TO service_role;


--
-- Name: TABLE white_label_config; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.white_label_config TO anon;
GRANT ALL ON TABLE public.white_label_config TO authenticated;
GRANT ALL ON TABLE public.white_label_config TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- PostgreSQL database dump complete
--
