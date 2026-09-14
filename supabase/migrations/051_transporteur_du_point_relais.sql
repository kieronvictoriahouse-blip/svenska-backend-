-- ═══════════════════════════════════════════════════════════════
-- LE TRANSPORTEUR DU POINT RELAIS CHOISI
--
-- Le panier envoyait déjà `relay_carrier_uuid` au checkout, et le
-- webhook le relisait — mais la colonne n'a jamais existé. La valeur
-- était donc silencieusement perdue, et la création d'étiquette
-- retombait toujours sur Mondial Relay.
--
-- Tant qu'un seul réseau était proposé, personne ne le voyait. Depuis
-- que le panier propose aussi Chronopost Shop2Shop (moins cher hors
-- de France, et seul réseau desservant la Suède), l'oubli devient une
-- erreur d'expédition : on ne dépose pas un colis Shop2Shop dans un
-- point Mondial Relay. Le colis serait refusé au dépôt.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE orders ADD COLUMN IF NOT EXISTS relay_carrier_uuid TEXT;

COMMENT ON COLUMN orders.relay_carrier_uuid IS
  'UUID du transporteur propriétaire du point relais choisi par le client (UGO/upelgo). Détermine le réseau utilisé pour l''étiquette et le suivi.';
