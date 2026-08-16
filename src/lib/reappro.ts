import { supabaseAdmin } from '@/lib/supabase';

/* ═══════════════════════════════════════════════════════════════
   DONNÉES DE L'ÉCRAN DE COMMANDE D'ACHAT

   Trois chiffres par produit portent tout le reste : stock courant,
   vélocité hebdomadaire et conditionnement. Les calculs de couverture
   et de suggestion se font côté écran, parce que le curseur de
   couverture les recalcule à chaque cran — un aller-retour serveur par
   mouvement de curseur serait injouable.

   La vélocité vient de `product_velocity`, recalculée chaque nuit et
   corrigée des ruptures : la moyenne calendaire sous-estime la demande
   des produits qui ont manqué, donc en recommande trop peu, donc les
   remet en rupture.

   L'assemblage vit ici plutôt que dans le handler pour rester
   vérifiable sans session : autrement, contrôler ce que l'écran affiche
   imposerait soit d'ouvrir une session sur un compte réel, soit de
   recopier ces requêtes dans un script — et on finirait par vérifier la
   copie plutôt que le code. Next.js interdit de toute façon les exports
   supplémentaires dans un fichier de route.
   ═══════════════════════════════════════════════════════════════ */

const J = (v: any): any[] => {
  try { return typeof v === 'string' ? JSON.parse(v) : (Array.isArray(v) ? v : []); }
  catch { return []; }
};

export async function donneesReappro() {
  const [{ data: fournisseurs }, { data: produits }, { data: velocites }, { data: sources }, { data: achats }, { data: cfg }] =
    await Promise.all([
      supabaseAdmin.from('contacts')
        .select('id, company, first_name, last_name, city, lead_time_days, free_shipping_sek, min_order_sek, last_order_at')
        .eq('type', 'supplier').eq('is_active', true),
      supabaseAdmin.from('products')
        .select('id, name_fr, name_sv, sku, sort_order, image_url, stock, stock_alert, cost_price, pack_size, track_stock, is_active, created_at')
        .eq('is_active', true),
      supabaseAdmin.from('product_velocity').select('*'),
      supabaseAdmin.from('product_suppliers').select('*'),
      supabaseAdmin.from('purchase_orders').select('lines, status, supplier_id, created_at')
        .in('status', ['sent', 'confirmed', 'partial', 'draft']),
      supabaseAdmin.from('white_label_config').select('*').limit(1).maybeSingle(),
    ]);

  const vitesse = Object.fromEntries((velocites || []).map(v => [v.product_id, v]));

  /* Déjà commandé et pas encore reçu : sans cette déduction, on
     recommande ce qui est déjà en route. */
  const enRoute: Record<string, number> = {};
  for (const po of achats || []) {
    for (const l of J(po.lines)) {
      const reste = (Number(l.qty) || 0) - (Number(l.received_qty) || 0);
      if (l.product_id && reste > 0) enRoute[l.product_id] = (enRoute[l.product_id] || 0) + reste;
    }
  }

  const nomFournisseur = (c: any) =>
    c.company || `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Fournisseur';

  /* Un article s'achete chez plusieurs magasins a des prix differents :
     on regroupe ses sources, et on retient la moins chere pour pouvoir
     signaler quand on s'apprete a payer plus cher ailleurs. */
  const parProduit: Record<string, any[]> = {};
  for (const s of sources || []) (parProduit[s.product_id] = parProduit[s.product_id] || []).push(s);

  const refs: Record<string, number> = {};
  for (const s of sources || []) refs[s.supplier_id] = (refs[s.supplier_id] || 0) + 1;

  const nomDe = Object.fromEntries((fournisseurs || []).map(c => [c.id, nomFournisseur(c)]));

  const NEUF_JOURS = 45;      // « nouveauté » : pas d'historique exploitable

  const catalogue = (produits || [])
    .filter(p => p.track_stock)
    .map(p => {
      const v = vitesse[p.id];
      const hebdo = Number(v?.weekly) || 0;
      const recent = p.created_at
        && (Date.now() - +new Date(p.created_at)) / 86400000 < NEUF_JOURS;

      const chezEux = (parProduit[p.id] || []);
      const moinsCher = chezEux
        .filter(s => Number(s.cost_eur) > 0)
        .sort((a, b) => Number(a.cost_eur) - Number(b.cost_eur))[0] || null;

      return {
        id: p.id,
        ref: p.sku || (p.sort_order ? `SC-${String(p.sort_order).padStart(4, '0')}` : p.id.slice(0, 6).toUpperCase()),
        name: p.name_fr,
        // Le fournisseur lit le suédois, pas le français : le handoff
        // impose de l'afficher partout où un produit est nommé.
        name_sv: p.name_sv && p.name_sv !== p.name_fr ? p.name_sv : null,
        image_url: p.image_url || null,
        /* Toutes les enseignes qui vendent cet article, avec leur prix.
           L'ecran filtre sur celle qui est selectionnee. */
        sources: chezEux.map(s => ({
          sup: s.supplier_id,
          cost: Number(s.cost_eur) || 0,
          sek: Number(s.cost_sek) || null,
          pack: Math.max(1, Number(s.pack_size) || Number(p.pack_size) || 1),
          fois: Number(s.times_bought) || 0,
          habituel: !!s.is_preferred,
        })),
        moinsCher: moinsCher
          ? { sup: moinsCher.supplier_id, cost: Number(moinsCher.cost_eur), nom: nomDe[moinsCher.supplier_id] || '' }
          : null,
        stock: Number(p.stock) || 0,
        onOrder: enRoute[p.id] || 0,
        pack: Math.max(1, Number(p.pack_size) || 1),
        cost: Number(p.cost_price) || 0,
        vel: hebdo,
        velCalendar: Number(v?.weekly_calendar) || 0,
        joursRupture: Number(v?.days_out) || 0,
        // Sans historique, la suggestion se fait sur un forfait : deux
        // cartons, comme le prototype, plutôt qu'un chiffre invente.
        isNew: !!recent || (!v && (Number(p.stock) || 0) > 0),
      };
    });

  const sansFournisseur = catalogue.filter(p => p.sources.length === 0).length;

  return {
    fournisseurs: (fournisseurs || []).map(c => ({
      id: c.id,
      name: nomFournisseur(c),
      city: c.city || '',
      delay: Number(c.lead_time_days) || 7,
      franco: Number(c.free_shipping_sek) || 0,
      min: Number(c.min_order_sek) || 0,
      last: c.last_order_at || null,
      refs: refs[c.id] || 0,
    })).sort((a, b) => b.refs - a.refs),
    catalogue,
    // Le taux est partagé avec la saisie de ticket : même conversion,
    // même chiffre, sinon deux écrans annoncent deux coûts d'achat.
    rate: Number(cfg?.sek_rate) || 0.0876,
    /* Un produit sans fournisseur n'apparaît dans aucune liste : il faut
       le dire, sinon il disparaît silencieusement du réapprovisionnement. */
    sansFournisseur,
  };
}
