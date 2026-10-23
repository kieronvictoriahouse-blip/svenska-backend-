-- ═══════════════════════════════════════════════════════════════
--  060 — Fabricant d'un produit (information obligatoire)
--
--  Vente de denrées à distance : les mentions de l'article 9 du
--  règlement (UE) 1169/2011 doivent être visibles avant l'achat
--  (article 14), dont le nom et l'adresse de l'exploitant sous le nom
--  duquel la denrée est commercialisée (9.1 h) — tels qu'imprimés sur
--  l'emballage, par exemple « Cloetta Sverige AB, Box 12, 172 21
--  Sundbyberg, Suède ».
--
--  manufacturer : texte libre, affiché tel quel sur la fiche produit
--                 (bloc « Informations »).
--
--  À appliquer AVANT de déployer le back-office qui écrit cette colonne.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE products ADD COLUMN IF NOT EXISTS manufacturer TEXT;
