-- ═══════════════════════════════════════════════════════════════
--  033 — Gabarits d'email modifiables depuis le back-office
--
--  Les fichiers de src/emails/templates restent la reference : cette
--  table ne contient QUE ce qui a ete modifie. Une ligne absente =
--  le gabarit d'origine. Supprimer la ligne, c'est revenir au modele
--  livre — d'ou l'absence de colonne « html_par_defaut ».
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS email_templates (
  key        TEXT PRIMARY KEY,
  subject    TEXT,
  html       TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT
);

ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_email_templates" ON email_templates;
CREATE POLICY "admin_email_templates" ON email_templates FOR ALL USING (auth.role() = 'authenticated');

COMMENT ON TABLE email_templates IS
  'Surcharges des gabarits ; une cle absente signifie « fichier d''origine »';
