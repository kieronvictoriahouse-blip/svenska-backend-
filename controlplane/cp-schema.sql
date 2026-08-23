-- ═══════════════════════════════════════════════════════════════
--  CONTROL PLANE — schéma (préfixe cp_ : peut cohabiter avec une
--  base existante en développement sans rien toucher)
--
--  Trois tables, trois responsabilités :
--    cp_clients    qui s'est inscrit, où en est son abonnement
--    cp_instances  ce qui a été provisionné, et jusqu'où
--    cp_evenements le journal — chaque étape du robot laisse une trace,
--                  même philosophie que le journal de stock du moteur
--
--  Idempotent, rejouable.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS cp_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  nom_boutique TEXT NOT NULL,
  siren TEXT,
  sous_domaine TEXT NOT NULL UNIQUE,
  -- Stripe Billing (abonnement Shopflow, pas les ventes du client)
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  -- inscrit → paye → actif → suspendu → resilie
  statut TEXT NOT NULL DEFAULT 'inscrit'
    CHECK (statut IN ('inscrit', 'paye', 'actif', 'suspendu', 'resilie')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cp_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES cp_clients (id),
  -- Supabase de l'instance
  supabase_ref TEXT,
  supabase_url TEXT,
  -- La clé service et le CRON_SECRET de l'instance : le control plane
  -- en a besoin pour migrer et auditer la flotte. Ce sont les SEULS
  -- secrets d'instance qu'il garde.
  supabase_service_key TEXT,
  cron_secret TEXT,
  -- Vercel de l'instance
  vercel_project_id TEXT,
  url_admin TEXT,
  url_boutique TEXT,
  -- Provisionnement : machine à états, reprise après échec au même
  -- endroit. L'ordre EST le pipeline.
  etape TEXT NOT NULL DEFAULT 'a_faire'
    CHECK (etape IN ('a_faire', 'base_creee', 'schema_joue', 'seed_joue',
                     'installe', 'vercel_cree', 'env_posees', 'pret', 'echec')),
  erreur TEXT,
  version_moteur TEXT,
  dernier_audit JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cp_instances_client ON cp_instances (client_id);
CREATE INDEX IF NOT EXISTS cp_instances_etape ON cp_instances (etape);

CREATE TABLE IF NOT EXISTS cp_evenements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID REFERENCES cp_instances (id),
  client_id UUID REFERENCES cp_clients (id),
  type TEXT NOT NULL,
  detail JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cp_evenements_instance ON cp_evenements (instance_id, created_at DESC);

ALTER TABLE cp_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE cp_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE cp_evenements ENABLE ROW LEVEL SECURITY;
