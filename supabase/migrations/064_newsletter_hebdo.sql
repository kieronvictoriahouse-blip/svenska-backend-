-- ═══════════════════════════════════════════════════════════════
-- 064 · Newsletter hebdomadaire automatique
--
-- Chaque mercredi la lettre de la semaine est préparée et son aperçu
-- envoyé à la boutique ; le jeudi elle part aux inscrits à la newsletter
-- (moins les adresses opposées), sauf si elle a été annulée dans le
-- back-office (Marketing → Newsletter). lib/newsletter-hebdo.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS newsletter_hebdo (
  semaine          date PRIMARY KEY,                -- lundi de la semaine (heure de Paris)
  statut           text NOT NULL DEFAULT 'preparee'
                   CHECK (statut IN ('preparee', 'annulee', 'en_cours', 'envoyee')),
  sujet            text,
  contenu          jsonb,                           -- ce que la lettre contient (aperçu, historique)
  apercu_envoye_at timestamptz,
  envoi_debut_at   timestamptz,
  envoi_fin_at     timestamptz,
  nb_envoyes       integer NOT NULL DEFAULT 0,
  nb_echecs        integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Une ligne par destinataire et par semaine : l'envoi reprend là où il
-- s'est arrêté, et personne ne reçoit deux fois la même lettre.
CREATE TABLE IF NOT EXISTS newsletter_hebdo_envois (
  semaine    date NOT NULL REFERENCES newsletter_hebdo(semaine) ON DELETE CASCADE,
  email      text NOT NULL,
  envoye_at  timestamptz NOT NULL DEFAULT now(),
  erreur     text,
  PRIMARY KEY (semaine, email)
);

ALTER TABLE newsletter_hebdo ENABLE ROW LEVEL SECURITY;
ALTER TABLE newsletter_hebdo_envois ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE newsletter_hebdo, newsletter_hebdo_envois FROM anon, authenticated;

-- Activée par défaut (choix de la boutique, 24/10/2026) ; « 0 » la coupe.
INSERT INTO company_settings (key, value) VALUES ('newsletter_auto', '1')
ON CONFLICT (key) DO NOTHING;
