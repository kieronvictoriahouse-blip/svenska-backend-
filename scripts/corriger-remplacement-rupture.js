/* ═══════════════════════════════════════════════════════════════
   ANNULATION DES MOUVEMENTS DE REMPLACEMENT

   Le handler de rupture bougeait le stock quand un client choisissait
   son article de remplacement : il rendait le manquant et sortait le
   remplaçant. C'était juste tant que le stock se déduisait au paiement.
   Depuis que la déduction se fait à l'expédition, les deux écritures
   sont fausses — et fausses dans les deux sens :

     · le remplaçant est encore sur l'étagère, le colis n'est pas parti.
       L'avoir sorti fait disparaître de la marchandise qu'on a ;
     · le manquant n'a jamais été là — c'est la définition d'une
       rupture. L'avoir « remis en stock » invente des unités, et le
       réassort cesse d'en réclamer.

   Mesuré le 19/08/2026 sur SD-0105 : Salvi affiché à −4 au lieu de −1,
   et 3 SC-0047 apparues sur un article en rupture.

   La cause est corrigée dans src/app/api/ruptures/route.ts, qui ne
   touche plus au stock. Ce script répare l'existant.

   Il n'efface rien : il écrit un mouvement inverse, daté et motivé,
   pour chaque écriture de remplacement. Le journal doit rester lisible
   — on ne réécrit pas le passé, on le corrige devant témoin.

   node scripts/corriger-remplacement-rupture.js          → simulation
   node scripts/corriger-remplacement-rupture.js --ecrire → écriture
   ═══════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').replace(/\r/g, '');
const lire = k => ((env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1] || '')
  .trim().replace(/^["']|["']$/g, '');

const sb = createClient(lire('NEXT_PUBLIC_SUPABASE_URL'), lire('SUPABASE_SERVICE_ROLE_KEY'));
const ECRIRE = process.argv.includes('--ecrire');
const MOTIF = 'Annulation mouvement de remplacement';

(async () => {
  const [{ data: aInverser }, { data: dejaFaites }] = await Promise.all([
    sb.from('stock_movements').select('*').eq('reason', 'replacement'),
    sb.from('stock_movements').select('product_id, reference').eq('reason', MOTIF),
  ]);

  /* Relance sans effet : une écriture déjà annulée se reconnaît au
     couple produit + référence dans le journal de correction. */
  const faites = new Set((dejaFaites || []).map(m => `${m.product_id}|${m.reference}`));

  const aFaire = (aInverser || []).filter(m => !faites.has(`${m.product_id}|CORR-${m.reference}`));
  if (!aFaire.length) {
    console.log('Rien à corriger — les', (aInverser || []).length, 'mouvements de remplacement sont déjà annulés.');
    return;
  }

  const ids = [...new Set(aFaire.map(m => m.product_id))];
  const { data: produits } = await sb.from('products').select('id, name_fr, sku, stock').in('id', ids);
  const parId = Object.fromEntries((produits || []).map(p => [p.id, p]));

  console.log(ECRIRE ? '── ÉCRITURE ──' : '── SIMULATION (ajouter --ecrire) ──');
  console.log(aFaire.length, 'mouvement(s) à annuler\n');

  /* Le stock se lit une fois puis se suit en mémoire : deux corrections
     sur un même produit doivent s'enchaîner, pas se recouvrir. */
  const courant = Object.fromEntries((produits || []).map(p => [p.id, Number(p.stock) || 0]));

  for (const m of aFaire) {
    const p = parId[m.product_id];
    if (!p) { console.log('  produit introuvable :', m.product_id); continue; }

    const delta = -Number(m.delta || 0);
    const avant = courant[m.product_id];
    const apres = Math.max(0, avant + delta);
    courant[m.product_id] = apres;

    console.log(`  ${(p.sku || '—').padEnd(8)} ${p.name_fr}`);
    console.log(`     ${m.reference} : ${m.delta > 0 ? '+' : ''}${m.delta}  →  correction ${delta > 0 ? '+' : ''}${delta}   (${avant} → ${apres})`);

    if (!ECRIRE) continue;

    await sb.from('products').update({ stock: apres }).eq('id', m.product_id);
    await sb.from('stock_movements').insert({
      product_id: m.product_id,
      quantity: Math.abs(delta),
      type: delta < 0 ? 'out' : 'in',
      delta, qty_before: avant, qty_after: apres,
      reason: MOTIF,
      reference: `CORR-${m.reference}`,
      note: `Annule le mouvement de ${m.delta > 0 ? '+' : ''}${m.delta} du ${String(m.created_at).slice(0, 10)} : `
          + `un remplacement ne sort plus la marchandise, elle part à l'expédition.`,
    });
  }

  console.log('\n' + (ECRIRE ? 'Écrit.' : 'Rien écrit — relancer avec --ecrire.'));
})().catch(e => { console.error(e); process.exit(1); });
