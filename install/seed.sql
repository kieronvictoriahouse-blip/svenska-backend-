-- ═══════════════════════════════════════════════════════════════
--  SEED — le minimum vital d'une instance neuve
--
--  Une seule ligne de configuration, NEUTRE : aucune marque, aucun
--  produit, aucune donnée de démonstration. L'identité du marchand
--  arrive par scripts/installer.js (ou l'écran Réglages), jamais d'ici.
--
--  Idempotent : ne fait rien si une configuration existe déjà.
-- ═══════════════════════════════════════════════════════════════

INSERT INTO white_label_config
  (site_name, site_slogan, color_primary, color_secondary, color_bg, color_text,
   font_display, font_body, font_ui,
   currency, tva_rate, free_shipping_threshold)
SELECT
  '', '', '#A99282', '#4E6651', '#E9DDCF', '#1B2118',
  'Cormorant Garamond', 'Crimson Pro', 'Jost',
  'EUR', 20, 50
WHERE NOT EXISTS (SELECT 1 FROM white_label_config);
