-- ═══════════════════════════════════════════════════════════════
--  042 — Remplacement panache
--
--  Jusqu'ici le client remplacait sa ligne par UN article : commander
--  trois pastilles et n'en vouloir qu'une de chaque parfum etait
--  impossible. `chosen_product_id` ne peut porter qu'un seul choix.
--
--  On garde ce champ — il reste juste et lisible pour le cas courant —
--  et on ajoute la repartition quand il y en a une. Un remplacement
--  simple laisse `chosen_mix` a NULL.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE order_line_choices
  ADD COLUMN IF NOT EXISTS chosen_mix JSONB;

COMMENT ON COLUMN order_line_choices.chosen_mix IS
  'Repartition choisie : [{ product_id, nom, qte, prix }]. NULL = un seul article de remplacement (voir chosen_product_id). La somme des qte vaut line_qty.';
