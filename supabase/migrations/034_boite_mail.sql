-- ═══════════════════════════════════════════════════════════════
--  034 — Boîte mail du back-office (IMAP sur hej@swedishcravings.fr)
--
--  Les messages sont mis en cache ici pour que l'ecran reste rapide :
--  ouvrir un dossier ne doit pas dependre d'un aller-retour IMAP.
--  IMAP reste la source de verite ; cette table est un miroir.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS inbox_messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identite IMAP. uid n'est unique QUE dans un dossier donne, et
  -- devient caduc si uid_validity change cote serveur.
  folder       TEXT NOT NULL DEFAULT 'INBOX',
  uid          BIGINT NOT NULL,
  uid_validity BIGINT,
  message_id   TEXT,

  from_name    TEXT,
  from_email   TEXT,
  to_emails    TEXT[],
  cc_emails    TEXT[],
  subject      TEXT,
  preview      TEXT,            -- extrait affiche dans la liste
  body_html    TEXT,
  body_text    TEXT,
  attachments  JSONB DEFAULT '[]'::jsonb,

  seen         BOOLEAN DEFAULT false,
  flagged      BOOLEAN DEFAULT false,   -- etoile
  answered     BOOLEAN DEFAULT false,
  draft        BOOLEAN DEFAULT false,
  label        TEXT,                    -- Clients, Fournisseurs, ...

  -- Rapprochement metier : un message d'un client connu remonte sur sa fiche.
  contact_id   UUID,
  order_id     UUID,

  sent_at      TIMESTAMPTZ,
  synced_at    TIMESTAMPTZ DEFAULT NOW(),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Cle naturelle IMAP : evite les doublons a chaque synchronisation.
CREATE UNIQUE INDEX IF NOT EXISTS inbox_messages_uid ON inbox_messages (folder, uid);
CREATE INDEX IF NOT EXISTS inbox_messages_date  ON inbox_messages (folder, sent_at DESC);
CREATE INDEX IF NOT EXISTS inbox_messages_from  ON inbox_messages (from_email);
CREATE INDEX IF NOT EXISTS inbox_messages_unseen ON inbox_messages (folder) WHERE seen = false;

ALTER TABLE inbox_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_inbox_messages" ON inbox_messages;
CREATE POLICY "admin_inbox_messages" ON inbox_messages FOR ALL USING (auth.role() = 'authenticated');

-- Etat de la synchronisation, pour l'affichage « il y a 3 min » et pour
-- savoir a partir de quel uid reprendre.
CREATE TABLE IF NOT EXISTS inbox_sync_state (
  folder       TEXT PRIMARY KEY,
  uid_validity BIGINT,
  last_uid     BIGINT DEFAULT 0,
  last_sync_at TIMESTAMPTZ,
  last_error   TEXT,
  quota_used   BIGINT,
  quota_total  BIGINT
);

ALTER TABLE inbox_sync_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_inbox_sync_state" ON inbox_sync_state;
CREATE POLICY "admin_inbox_sync_state" ON inbox_sync_state FOR ALL USING (auth.role() = 'authenticated');

COMMENT ON COLUMN inbox_messages.uid IS
  'UID IMAP — unique dans son dossier seulement, invalide si uid_validity change';
