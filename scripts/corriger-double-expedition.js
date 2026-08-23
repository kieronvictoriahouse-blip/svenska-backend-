/* ═══════════════════════════════════════════════════════════════
   CORRECTION DES EXPÉDITIONS PASSÉES DEUX FOIS

   L'écran de préparation sortait le stock, PUIS soldait la commande.
   Quand la seconde étape échouait, la marchandise était déjà partie du
   stock : l'opérateur voyait « échec », recommençait, et le stock
   sortait une deuxième fois. La commande, elle, n'enregistrait qu'un
   seul colis.

   Constaté sur SD-0107 (17/08, deux passes à une heure d'intervalle) et
   SD-0105 (20/08, quatre minutes d'intervalle).

   La cause est corrigée : l'expédition passe par
   /api/orders/[id]/expedier, qui plafonne le colis à ce qui reste
   réellement dû, relu en base. Un rejeu ne retire plus rien.

   ── Ce que ce script corrige, et ce qu'il ne corrige pas ────────────

   Il compare, par commande et par produit, ce qui est DÛ à ce qui est
   réellement SORTI du stock — mesuré sur qty_before − qty_after, pas
   sur la somme des deltas. La nuance compte : quand la route de
   mouvement plafonnait le stock à zéro, elle écrivait un delta de −1
   sans rien retirer. Compter ces deltas recréditerait de la marchandise
   qui n'a jamais bougé.

   Seul le SURPLUS est rendu : des unités retirées deux fois pour un
   seul colis sont physiquement restées en rayon.

   Le cas inverse — de la marchandise partie sans que le stock bouge,
   parce qu'il était déjà à zéro — n'est PAS corrigé automatiquement.
   Il dit que le stock était déjà faux avant l'expédition, et seule une
   personne devant l'étagère peut trancher. Le script le signale.

   node scripts/corriger-double-expedition.js          → simulation
   node scripts/corriger-double-expedition.js --ecrire → écriture
   ═══════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').replace(/\r/g, '');
const lire = k => ((env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1] || '')
  .trim().replace(/^["']|["']$/g, '');
const sb = createClient(lire('NEXT_PUBLIC_SUPABASE_URL'), lire('SUPABASE_SERVICE_ROLE_KEY'));

const J = v => { try { return Array.isArray(v) ? v : JSON.parse(v || '[]'); } catch { return []; } };
const ECRIRE = process.argv.includes('--ecrire');
const MOTIF = 'Correction double expédition';

(async () => {
  const [{ data: produits }, { data: commandes }, { data: mouvements }, { data: dejaFaites }] =
    await Promise.all([
      sb.from('products').select('id, sku, name_fr, stock'),
      sb.from('orders').select('order_number, lines'),
      sb.from('stock_movements').select('*').eq('reason', 'picking'),
      sb.from('stock_movements').select('product_id, reference').eq('reason', MOTIF),
    ]);

  const P = Object.fromEntries((produits || []).map(p => [p.id, p]));
  const nom = id => (P[id] ? `${P[id].sku || '--'} ${P[id].name_fr}` : id);
  const faites = new Set((dejaFaites || []).map(m => `${m.product_id}|${m.reference}`));

  /* Ce qui est réellement sorti du rayon, par commande et par produit. */
  const sorti = {};
  for (const m of mouvements || []) {
    if (!m.reference || m.qty_before === null || m.qty_after === null) continue;
    const c = (sorti[m.reference] = sorti[m.reference] || {});
    c[m.product_id] = (c[m.product_id] || 0) + (Number(m.qty_before) - Number(m.qty_after));
  }

  const aRendre = [];
  const aRegarder = [];

  for (const [ref, parProduit] of Object.entries(sorti)) {
    const o = (commandes || []).find(x => x.order_number === ref);
    if (!o) continue;
    const du = {};
    for (const l of J(o.lines)) {
      if (l.product_id) du[l.product_id] = (du[l.product_id] || 0) + (Number(l.qty) || 0);
    }
    for (const [pid, reel] of Object.entries(parProduit)) {
      const ecart = reel - (du[pid] || 0);
      if (ecart > 0) aRendre.push({ ref, pid, du: du[pid] || 0, reel, qte: ecart });
      else if (ecart < 0) aRegarder.push({ ref, pid, du: du[pid] || 0, reel });
    }
  }

  console.log(ECRIRE ? '-- ECRITURE --' : '-- SIMULATION (ajouter --ecrire) --');
  console.log('');

  const restant = aRendre.filter(r => !faites.has(`${r.pid}|CORR-${r.ref}`));
  if (!restant.length) {
    console.log('Rien a rendre : aucun surplus, ou deja corrige.');
  } else {
    console.log('SURPLUS A RENDRE — retire deux fois pour un seul colis :');
    console.log('');
    const courant = Object.fromEntries((produits || []).map(p => [p.id, Number(p.stock) || 0]));
    for (const r of restant) {
      const avant = courant[r.pid];
      const apres = avant + r.qte;
      courant[r.pid] = apres;
      console.log(`  ${r.ref}  ${nom(r.pid).padEnd(46)} du ${r.du}, sorti ${r.reel}  ->  +${r.qte}   (${avant} -> ${apres})`);
      if (!ECRIRE) continue;

      await sb.from('products').update({ stock: apres }).eq('id', r.pid);
      await sb.from('stock_movements').insert({
        product_id: r.pid,
        quantity: r.qte, type: 'in',
        delta: r.qte, qty_before: avant, qty_after: apres,
        reason: MOTIF,
        reference: `CORR-${r.ref}`,
        note: `${r.ref} : ${r.du} du, ${r.reel} sorti du rayon. Le surplus n'a jamais quitte l'etagere.`,
      });
    }
    console.log('');
    console.log(`  total : ${restant.reduce((s, r) => s + r.qte, 0)} unite(s) rendues au stock`);
  }

  if (aRegarder.length) {
    console.log('');
    console.log('A REGARDER — parti chez le client sans que le stock bouge :');
    console.log('(le stock etait deja a zero ; rien n\'est corrige ici, c\'est un comptage physique)');
    console.log('');
    for (const r of aRegarder) {
      console.log(`  ${r.ref}  ${nom(r.pid).padEnd(46)} du ${r.du}, sorti du rayon ${r.reel}`);
    }
  }

  console.log('');
  console.log(ECRIRE ? 'Ecrit.' : 'Rien ecrit — relancer avec --ecrire.');
})().catch(e => { console.error(e); process.exit(1); });
