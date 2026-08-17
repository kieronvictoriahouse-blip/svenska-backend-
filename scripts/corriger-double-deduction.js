/* ═══════════════════════════════════════════════════════════════
   CORRECTION DE LA DOUBLE DÉDUCTION DE STOCK

   Le stock était déduit DEUX FOIS pour une même vente :
     · au paiement, par le webhook Stripe (`applySaleStock`, idempotent) ;
     · puis à la validation du picking, par un mouvement brut.

   Résultat mesuré le 17/08/2026 : 40 unités retirées pour rien sur
   16 produits, dont 8 affichés à zéro alors qu'il en restait. Le contrôle
   de stock du tunnel d'achat s'appuyant sur cette valeur, la boutique
   REFUSAIT des commandes qu'elle pouvait honorer.

   La cause est corrigée dans l'écran de préparation, qui ne touche plus
   au stock. Ce script répare l'existant.

   Il n'efface aucun mouvement : il en ajoute un compensateur, tracé,
   pour chaque déduction en double. Le journal doit rester lisible — on
   ne réécrit pas le passé, on le corrige devant témoin.

   node scripts/corriger-double-deduction.js          → simulation
   node scripts/corriger-double-deduction.js --ecrire → écriture
   ═══════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').replace(/\r/g, '');
const lire = k => ((env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1] || '')
  .trim().replace(/^["']|["']$/g, '');

const sb = createClient(lire('NEXT_PUBLIC_SUPABASE_URL'), lire('SUPABASE_SERVICE_ROLE_KEY'));
const ECRIRE = process.argv.includes('--ecrire');
const MOTIF = 'Correction double déduction picking';

(async () => {
  const [{ data: doubles }, { data: dejaFaites }, { data: produits }] = await Promise.all([
    sb.from('stock_movements').select('*').eq('reason', 'picking'),
    sb.from('stock_movements').select('reference').eq('reason', MOTIF),
    sb.from('products').select('id, name_fr, stock'),
  ]);

  /* Relance sans effet : un mouvement deja compense porte sa reference
     dans le journal de correction. */
  const compensees = new Set((dejaFaites || []).map(m => m.reference));
  const aCorriger = (doubles || []).filter(m => Number(m.delta) < 0 && !compensees.has(m.id));

  if (!aCorriger.length) {
    console.log('Rien à corriger — les déductions en double sont déjà compensées.');
    return;
  }

  const nom = Object.fromEntries((produits || []).map(p => [p.id, p.name_fr]));
  const stock = Object.fromEntries((produits || []).map(p => [p.id, Number(p.stock) || 0]));

  const parProduit = {};
  for (const m of aCorriger) {
    parProduit[m.product_id] = (parProduit[m.product_id] || 0) + Math.abs(Number(m.delta));
  }

  const total = Object.values(parProduit).reduce((s, n) => s + n, 0);
  console.log(`${aCorriger.length} mouvements en double · ${total} unités à rendre\n`);
  console.log('produit                                 actuel →  corrigé');
  for (const [pid, n] of Object.entries(parProduit).sort((a, b) => b[1] - a[1])) {
    const av = stock[pid] ?? 0;
    const debloque = av <= 0 && av + n > 0 ? '   ← redevient vendable' : '';
    console.log('  ',
      String(nom[pid] || pid).slice(0, 36).padEnd(38),
      String(av).padStart(5), '→', String(av + n).padStart(5), debloque);
  }

  const debloques = Object.entries(parProduit)
    .filter(([pid, n]) => (stock[pid] ?? 0) <= 0 && (stock[pid] ?? 0) + n > 0).length;
  console.log(`\n${debloques} produit(s) repassent au-dessus de zéro et redeviennent commandables.`);

  if (!ECRIRE) { console.log('\nSimulation. Relance avec --ecrire pour appliquer.'); return; }

  for (const m of aCorriger) {
    const rendu = Math.abs(Number(m.delta));
    const avant = stock[m.product_id] ?? 0;
    const apres = avant + rendu;

    const { error: e1 } = await sb.from('products')
      .update({ stock: apres }).eq('id', m.product_id);
    if (e1) { console.error('Échec produit', m.product_id, ':', e1.message); process.exit(1); }

    await sb.from('stock_movements').insert({
      product_id: m.product_id,
      delta: rendu,
      quantity: rendu,
      type: 'in',
      reason: MOTIF,
      // La reference pointe le mouvement compense : la relance le voit.
      reference: m.id,
      note: `Compense le mouvement picking du ${String(m.created_at).slice(0, 10)}`,
      qty_before: avant,
      qty_after: apres,
    });
    stock[m.product_id] = apres;
  }

  console.log(`\nÉcrit. ${total} unités rendues, ${aCorriger.length} mouvements compensateurs tracés.`);
})();
