-- ═══════════════════════════════════════════════════════════════
--  044 — Suppression de decrement_stock
--
--  Cette fonction SECURITY DEFINER modifiait products.stock sans
--  écrire le moindre mouvement au journal. Plus rien ne l'appelle :
--  toute variation passe par adjustStock/poserStock (src/lib/stock.ts),
--  qui journalisent et écrivent sous garde optimiste.
--
--  La laisser en place, c'est laisser à portée de main l'outil exact
--  des deux dérives passées — la déduction muette (+77 unités
--  fantômes) et la déduction au paiement. Une fonction qui contourne
--  le journal ne doit pas exister, même inutilisée.
--
--  Rejouable sans risque.
-- ═══════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS decrement_stock(UUID, INTEGER);
