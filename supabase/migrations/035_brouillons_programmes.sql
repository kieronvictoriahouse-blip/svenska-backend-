-- ═══════════════════════════════════════════════════════════════
--  035 — Brouillons, envois programmés, et filtre pièces jointes
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. Filtre « avec pièce jointe » côté base ────────────────────
-- Il se faisait en JavaScript apres avoir ramene toute la liste :
-- correct sur 200 messages, intenable au-dela. Colonne generee, donc
-- toujours coherente avec attachments, jamais a maintenir.
ALTER TABLE inbox_messages
  ADD COLUMN IF NOT EXISTS has_attachment BOOLEAN
  GENERATED ALWAYS AS (jsonb_array_length(COALESCE(attachments, '[]'::jsonb)) > 0) STORED;

CREATE INDEX IF NOT EXISTS inbox_messages_pj
  ON inbox_messages (folder, sent_at DESC) WHERE has_attachment;

-- ─── 2. Brouillons ────────────────────────────────────────────────
-- Le brouillon vit en base tant qu'il est en cours d'ecriture, et il
-- est depose dans le dossier Drafts du serveur a l'enregistrement.
-- `imap_uid` retient la copie serveur : a chaque reenregistrement il
-- faut supprimer la precedente, sinon la boite se remplit de doublons.
CREATE TABLE IF NOT EXISTS email_drafts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  to_emails   TEXT,
  cc_emails   TEXT,
  subject     TEXT,
  body        TEXT,
  attachments JSONB DEFAULT '[]'::jsonb,
  in_reply_to TEXT,
  imap_uid    BIGINT,
  imap_folder TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS email_drafts_date ON email_drafts (updated_at DESC);

ALTER TABLE email_drafts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_email_drafts" ON email_drafts;
CREATE POLICY "admin_email_drafts" ON email_drafts FOR ALL USING (auth.role() = 'authenticated');

-- ─── 3. Envois programmés ─────────────────────────────────────────
-- `status` est la garde anti-double-envoi : le cron passe une ligne en
-- 'sending' avant de tenter l'envoi, et ne reprend jamais une ligne qui
-- n'est pas 'pending'. Un cron qui se chevauche ne peut donc pas
-- envoyer deux fois le meme message.
CREATE TABLE IF NOT EXISTS scheduled_emails (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  to_emails   TEXT NOT NULL,
  cc_emails   TEXT,
  subject     TEXT NOT NULL,
  body        TEXT,
  attachments JSONB DEFAULT '[]'::jsonb,
  in_reply_to TEXT,

  send_at     TIMESTAMPTZ NOT NULL,
  -- pending | sending | sent | failed | cancelled
  status      TEXT NOT NULL DEFAULT 'pending',
  attempts    INTEGER NOT NULL DEFAULT 0,
  last_error  TEXT,
  sent_at     TIMESTAMPTZ,

  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS scheduled_emails_due
  ON scheduled_emails (send_at) WHERE status = 'pending';

ALTER TABLE scheduled_emails ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_scheduled_emails" ON scheduled_emails;
CREATE POLICY "admin_scheduled_emails" ON scheduled_emails FOR ALL USING (auth.role() = 'authenticated');

COMMENT ON COLUMN scheduled_emails.status IS
  'pending -> sending -> sent : le passage par sending empeche le double envoi';
COMMENT ON COLUMN email_drafts.imap_uid IS
  'Copie serveur du brouillon, a supprimer avant d''en deposer une nouvelle';
