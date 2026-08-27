/* ═══════════════════════════════════════════════════════════════
   RÉCEPTION GEKAS — BC ACH-0001, réception PARTIELLE du 19/08/2026

   Saisie par script plutôt qu'à l'écran : 20 lignes, 4 fiches produit
   à créer, un contrôle de totaux à faire AVANT d'écrire — l'écran ne
   sait pas tout faire d'un geste, le script si, et il en reste une
   trace versionnée.

   Règles appliquées (données du patron, 23/08/2026) :
   · seules les lignes ci-dessous entrent ; le reliquat du BC est
     ABANDONNÉ (pas de backorder) ;
   · coût unitaire = PU+T SEK (transport 550 SEK déjà réparti au
     prorata des 158 pièces) × taux SEK→EUR 0,0876 — le taux que
     l'application avait utilisé pour composer ce BC
     (purchase_orders.exchange_rate_used) ;
   · PMP : même formule que l'écran de réception
     (stock·pmp + qté·coût) / (stock + qté) ;
   · le mouvement porte la référence « GEKAS ACH-0001 » ; la DATE de
     réception (19/08) vit sur la pièce de réception — le journal de
     stock, lui, s'écrit à l'instant de la saisie : l'antidater
     casserait la chaîne avant/après que l'audit vérifie ;
   · 4 produits n'existent pas : créés INACTIFS et sans prix de vente
     (personne ne vend à 0 € par accident) — à tarifer puis activer ;
   · 2 produits existaient sans référence (Gott & Blandat, Rub BBQ) :
     ils reçoivent leur SKU et passent en suivi de stock.

   Idempotent : une ligne déjà entrée (référence + produit au journal)
   est sautée. Relançable après une coupure.

   node scripts/reception-gekas-ach0001.js            → simulation
   node scripts/reception-gekas-ach0001.js --ecrire   → écriture
   ═══════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').replace(/\r/g, '');
const lire = k => ((env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1] || '')
  .trim().replace(/^["']|["']$/g, '');
const sb = createClient(lire('NEXT_PUBLIC_SUPABASE_URL'), lire('SUPABASE_SERVICE_ROLE_KEY'));

const ECRIRE = process.argv.includes('--ecrire');
const TAUX = 0.0876;                       // exchange_rate_used du BC ACH-0001
const REF = 'GEKAS ACH-0001';
const DATE_RECEPTION = '2026-08-19';
const r4 = v => Math.round(v * 10000) / 10000;
const r2 = v => Math.round(v * 100) / 100;

/* sku | nom (pour les créations : {fr,sv,en}) | qté | PU SEK | PU+T SEK */
const LIGNES = [
  { sku: 'SC-0045', qte: 15, pu: 16.95, put: 20.43 },
  { neuf: { fr: 'Pastilles Läkerol Sea Salt 75g', sv: 'Halstabletter Sea Salt 75g Läkerol', en: 'Läkerol Sea Salt pastilles 75g' }, qte: 15, pu: 16.95, put: 20.43 },
  { sku: 'SC-0044', qte: 6, pu: 16.95, put: 20.43 },
  { sku: 'SC-0046', qte: 6, pu: 16.95, put: 20.43 },
  { neuf: { fr: 'Marabou Chocolat au Lait', sv: 'Marabou Mjölkchoklad', en: 'Marabou Milk Chocolate' }, qte: 16, pu: 26.95, put: 30.43 },
  { neuf: { fr: 'Marabou Rulle Caramel', sv: 'Marabou Rulle Karamell', en: 'Marabou Rulle Caramel' }, qte: 9, pu: 15.00, put: 18.48 },
  { neuf: { fr: 'Marabou Rulle Menthe', sv: 'Marabou Rulle Mint', en: 'Marabou Rulle Mint' }, qte: 9, pu: 15.00, put: 18.48 },
  { nomExistant: 'Gott & Blandat', qte: 15, pu: 3.70, put: 7.18 },
  { sku: 'SC-0019', qte: 8, pu: 12.95, put: 16.43 },
  { sku: 'SC-0022', qte: 13, pu: 34.95, put: 38.43 },
  { sku: 'SC-0051', qte: 3, pu: 14.10, put: 17.58 },
  { nomExistant: 'Rub BBQ', qte: 10, pu: 7.50, put: 10.98 },
  { sku: 'SC-0031', qte: 4, pu: 6.55, put: 10.03 },
  { sku: 'SC-0035', qte: 3, pu: 6.55, put: 10.03 },
  { sku: 'SC-0037', qte: 5, pu: 6.55, put: 10.03 },
  { sku: 'SC-0030', qte: 1, pu: 6.55, put: 10.03 },
  { sku: 'SC-0039', qte: 5, pu: 6.55, put: 10.03 },
  { sku: 'SC-0033', qte: 8, pu: 6.95, put: 10.43 },
  { sku: 'SC-0034', qte: 3, pu: 6.55, put: 10.03 },
  { sku: 'SC-0036', qte: 4, pu: 6.55, put: 10.03 },
];

(async () => {
  /* ── 0. Les totaux du patron doivent tomber juste AVANT d'écrire ── */
  const pieces = LIGNES.reduce((s, l) => s + l.qte, 0);
  const marchandises = r2(LIGNES.reduce((s, l) => s + l.qte * l.pu, 0));
  if (pieces !== 158) throw new Error(`pièces : ${pieces} ≠ 158`);
  if (marchandises !== 2363.20) throw new Error(`marchandises : ${marchandises} ≠ 2363,20 SEK`);
  console.log(`Contrôles amont : 158 pièces ✓ · 2 363,20 SEK ✓ · +550 transport = 2 913,20 SEK ✓ · taux ${TAUX}`);
  console.log(ECRIRE ? '── ÉCRITURE ──\n' : '── SIMULATION (ajouter --ecrire) ──\n');

  /* ── 1. Résoudre chaque ligne vers un produit ─────────────────── */
  const { data: prods } = await sb.from('products').select('id, sku, name_fr, stock, cost_price, is_active, track_stock');
  const dernierSku = Math.max(...prods.map(p => parseInt(String(p.sku || '').slice(3), 10)).filter(n => !isNaN(n)));
  let prochainSku = dernierSku + 1;

  const { data: dejaFait } = await sb.from('stock_movements').select('product_id').eq('reference', REF);
  const dejaEntres = new Set((dejaFait || []).map(m => m.product_id));

  /* GARDE DURE : la reception compte 20 lignes. 20 mouvements au
     journal = tout est entre, ce script n'a PLUS RIEN a faire — et
     surtout pas creer des fiches. C'est la relance aveugle qui a
     duplique 8 produits le 23/08 ; cette garde la rend inoffensive. */
  if ((dejaFait || []).length >= LIGNES.length) {
    console.log('Reception deja integralement entree (' + dejaFait.length + ' mouvements). Rien a faire.');
    return;
  }

  const creations = [];
  const skusAttribues = [];
  for (const l of LIGNES) {
    if (l.sku) {
      l.produit = prods.find(p => p.sku === l.sku);
      if (!l.produit) throw new Error('SKU introuvable : ' + l.sku);
    } else if (l.nomExistant) {
      l.produit = prods.find(p => (p.name_fr || '').includes(l.nomExistant));
      if (!l.produit) throw new Error('produit existant introuvable : ' + l.nomExistant);
      if (!l.produit.sku) {
        l.produit.skuNouveau = 'SC-' + String(prochainSku++).padStart(4, '0');
        skusAttribues.push(`${l.produit.skuNouveau} → ${l.produit.name_fr}`);
      }
    } else if (l.neuf) {
      /* La fiche existe peut-etre deja — creee par une relance ou a la
         main : on la retrouve par son NOM avant d'en inventer une. */
      const existante = prods.find(p => p.name_fr === l.neuf.fr);
      if (existante) { l.produit = existante; continue; }
      l.produit = {
        id: null, name_fr: l.neuf.fr, stock: 0, cost_price: 0,
        skuNouveau: 'SC-' + String(prochainSku++).padStart(4, '0'),
        aCreer: l.neuf,
      };
      creations.push(`${l.produit.skuNouveau} → ${l.neuf.fr} (INACTIF, prix de vente à fixer)`);
    }
  }

  /* ── 2. Créer les fiches manquantes ───────────────────────────── */
  for (const l of LIGNES) {
    if (!l.produit.aCreer) continue;
    if (!ECRIRE) continue;
    /* Relance : la fiche existe deja sous ce SKU — on la reutilise au
       lieu d'en creer une deuxieme. C'est CE controle qui manquait : la
       premiere version creait les fiches AVANT de verifier le journal,
       et une relance a duplique quatre produits. */
    const deja = prods.find(x => x.sku === l.produit.skuNouveau);
    if (deja) { l.produit.id = deja.id; l.produit.stock = deja.stock; l.produit.cost_price = deja.cost_price; continue; }
    const { data: cree, error } = await sb.from('products').insert({
      name_fr: l.produit.aCreer.fr, name_sv: l.produit.aCreer.sv, name_en: l.produit.aCreer.en,
      sku: l.produit.skuNouveau,
      price: 0,
      /* Inactif tant que le prix de vente n'est pas fixé : un produit à
         0 € en vitrine serait offert au premier passant. */
      is_active: false,
      track_stock: true,
      stock: 0,
    }).select('id, stock, cost_price').single();
    if (error) throw new Error('création ' + l.produit.aCreer.fr + ' : ' + error.message);
    l.produit.id = cree.id; l.produit.stock = cree.stock || 0; l.produit.cost_price = cree.cost_price || 0;
  }

  /* ── 3. Entrer chaque ligne : SKU, PMP, stock, journal ────────── */
  const recap = [];
  const lignesReception = [];
  let totalEur = 0;
  for (const l of LIGNES) {
    const p = l.produit;
    const coutEur = r4(l.put * TAUX);
    const avant = Number(p.stock) || 0;
    const apres = avant + l.qte;
    const pmpAvant = Number(p.cost_price) || 0;
    const pmp = r4(apres > 0 ? (avant * pmpAvant + l.qte * coutEur) / apres : coutEur);
    totalEur += l.qte * coutEur;
    const saute = p.id && dejaEntres.has(p.id);
    recap.push({
      sku: p.skuNouveau || p.sku, nom: p.name_fr, qte: l.qte,
      avant, apres, coutEur, pmpAvant, pmp, saute,
    });
    lignesReception.push({
      product_id: p.id, name: p.name_fr, qty: l.qte, received_qty: l.qte,
      unit_cost: coutEur, unit_cost_eur: coutEur, unit_cost_sek: l.put,
      total: r2(l.qte * coutEur),
    });
    if (!ECRIRE || saute) continue;

    const maj = { stock: apres, cost_price: pmp, track_stock: true };
    if (p.skuNouveau && !p.aCreer) maj.sku = p.skuNouveau;
    const { error: e1 } = await sb.from('products').update(maj).eq('id', p.id);
    if (e1) throw new Error('produit ' + p.name_fr + ' : ' + e1.message);

    const { error: e2 } = await sb.from('stock_movements').insert({
      product_id: p.id,
      quantity: l.qte, type: 'in',
      delta: l.qte, qty_before: avant, qty_after: apres,
      reason: 'Réception 0012 — GEKAS',
      reference: REF,
      note: `Réception du ${DATE_RECEPTION} — BC ACH-0001, partielle (reliquat abandonné). ${l.put} SEK/pc × ${TAUX}`,
    });
    if (e2) throw new Error('journal ' + p.name_fr + ' : ' + e2.message);
  }

  /* ── 4. La pièce de réception + le BC soldé ───────────────────── */
  if (ECRIRE) {
    const { data: po } = await sb.from('purchase_orders').select('id, supplier_id, lines').eq('number', 'ACH-0001').single();
    const { data: existe } = await sb.from('receptions').select('id').eq('number', 'REC-0012').maybeSingle();
    if (!existe) {
      const { error: e3 } = await sb.from('receptions').insert({
        number: 'REC-0012', purchase_order_id: po.id, supplier_id: po.supplier_id,
        supplier_name: 'GEKAS', status: 'done', received_at: DATE_RECEPTION,
        notes: `Réception partielle du BC ACH-0001 (paiement Mastercard, intracommunautaire — autoliquidation). ` +
          `Transport 550 SEK réparti au prorata des 158 pièces. Taux SEK→EUR ${TAUX}. Reliquat abandonné.`,
        lines: JSON.stringify(lignesReception),
      });
      if (e3) throw new Error('réception : ' + e3.message);
    }
    /* Le BC est soldé : réception partielle actée, reliquat abandonné. */
    const lignesBc = (() => { try { return JSON.parse(po.lines); } catch { return []; } })();
    const recuPar = Object.fromEntries(lignesReception.filter(x => x.product_id).map(x => [x.product_id, x.qty]));
    for (const lb of lignesBc) if (lb.product_id && recuPar[lb.product_id]) lb.received_qty = recuPar[lb.product_id];
    await sb.from('purchase_orders').update({
      status: 'received',
      lines: JSON.stringify(lignesBc),
      notes: `Réception partielle REC-0012 du ${DATE_RECEPTION} — reliquat abandonné.`,
      updated_at: new Date().toISOString(),
    }).eq('id', po.id);
  }

  /* ── 5. Récapitulatif ─────────────────────────────────────────── */
  console.log('sku       qté   avant → après   coût €/pc   PMP avant → après');
  for (const r of recap) {
    console.log(
      `${String(r.sku).padEnd(9)}${String(r.qte).padStart(4)}   ${String(r.avant).padStart(4)} → ${String(r.apres).padStart(5)}` +
      `   ${r.coutEur.toFixed(4).padStart(8)}   ${r.pmpAvant.toFixed(4)} → ${r.pmp.toFixed(4)}` +
      `${r.saute ? '   (déjà entré — sauté)' : ''}   ${r.nom.slice(0, 34)}`);
  }
  if (creations.length) { console.log('\nFiches créées :'); creations.forEach(c => console.log('  +', c)); }
  if (skusAttribues.length) { console.log('Références attribuées :'); skusAttribues.forEach(c => console.log('  ·', c)); }
  console.log(`\nTotal enregistré : ${r2(totalEur)} EUR (${r2(totalEur / TAUX)} SEK au taux ${TAUX})`);
  console.log(ECRIRE ? 'Écrit. Lancer node scripts/audit-stock.js pour le contrôle.' : 'Rien écrit — relancer avec --ecrire.');
})().catch(e => { console.error('ÉCHEC :', e.message); process.exit(1); });
