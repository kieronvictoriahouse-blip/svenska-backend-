/* ═══════════════════════════════════════════════════════════════
   AUDIT DE LA FACTURATION — lecture seule, comme audit-stock.js

   Sept contrôles :
     1. numérotation séquentielle continue, sans trou ni doublon
     2. chaîne d'intégrité : chaque empreinte se recalcule juste
     3. chaque commande payée réelle a sa facture
     4. la facture dit le même montant que sa commande
     5. chaque remboursement a son avoir
     6. mentions légales présentes sur chaque pièce
     7. les recettes comptables recoupent les commandes payées

   node scripts/audit-facturation.js
   ═══════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').replace(/\r/g, '');
const lire = k => ((env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1] || '')
  .trim().replace(/^["']|["']$/g, '');
const sb = createClient(lire('NEXT_PUBLIC_SUPABASE_URL'), lire('SUPABASE_SERVICE_ROLE_KEY'));

let alertes = 0;
const titre = t => console.log('\n' + t + '\n' + '-'.repeat(t.length));
const ok = m => console.log('   [ok] ' + m);
const ko = m => { alertes++; console.log('   [!!] ' + m); };
const info = m => console.log('        ' + m);

/* Même canonicalisation que src/lib/facture-integrite.ts. */
const GENESIS = 'GENESIS';
const CHAMPS = ['number', 'date', 'client_name', 'client_email', 'client_address',
  'seller_name', 'seller_siret', 'total_ht', 'total_tva', 'total_ttc', 'legal_mention'];
function canonique(inv) {
  let lignes = [];
  try {
    const l = typeof inv.lines === 'string' ? JSON.parse(inv.lines) : (inv.lines || []);
    lignes = (Array.isArray(l) ? l : []).map(x => ({
      d: String(x.desc || x.name || ''), q: Number(x.qty) || 0, p: (Number(x.price) || 0).toFixed(2),
    }));
  } catch { }
  const base = {};
  for (const c of CHAMPS) {
    base[c] = ['total_ht', 'total_tva', 'total_ttc'].includes(c)
      ? (Number(inv[c]) || 0).toFixed(2) : String(inv[c] ?? '');
  }
  return JSON.stringify({ ...base, lignes });
}
const empreinte = (c, p) => createHash('sha256').update(p + '\n' + c, 'utf8').digest('hex');

(async () => {
  const [{ data: factures }, { data: commandes }, { data: ecritures }] = await Promise.all([
    sb.from('invoices').select('*'),
    sb.from('orders').select('id, order_number, status, total, refunded_amount, refunds, is_test, exclude_from_stats, created_at, customer_name'),
    sb.from('accounting_entries').select('*').eq('type', 'income'),
  ]);

  console.log('===========================================================');
  console.log('  AUDIT DE LA FACTURATION -- ' + new Date().toISOString().slice(0, 10));
  console.log('===========================================================');
  console.log(`\n${(factures || []).length} factures | ${(commandes || []).length} commandes | ${(ecritures || []).length} recettes comptables`);

  /* ── 1. Numérotation ──────────────────────────────────────────── */
  titre('1. La numerotation est-elle continue ?');
  const parPrefixe = {};
  let nonConformes = 0;
  for (const i of factures || []) {
    const m = String(i.number || '').match(/^(.*-)(\d+)$/);
    if (!m) { nonConformes++; ko(`numero non conforme : « ${i.number} »`); continue; }
    (parPrefixe[m[1]] = parPrefixe[m[1]] || []).push(parseInt(m[2], 10));
  }
  for (const [pref, nums] of Object.entries(parPrefixe)) {
    nums.sort((a, b) => a - b);
    const doublons = [...new Set(nums.filter((n, i) => nums.indexOf(n) !== i))];
    const trous = [];
    for (let k = nums[0]; k <= nums[nums.length - 1]; k++) if (!nums.includes(k)) trous.push(k);
    if (doublons.length) ko(`${pref} : doublons ${doublons.join(', ')}`);
    if (trous.length) ko(`${pref} : trous ${trous.join(', ')}`);
    if (!doublons.length && !trous.length) ok(`${pref} : ${nums.length} pieces, sequence continue`);
  }

  /* ── 2. Chaîne d'intégrité ────────────────────────────────────── */
  titre('2. La chaine d\'integrite tient-elle ?');
  const scellees = (factures || []).filter(i => i.chain_hash)
    .sort((a, b) => (a.finalized_at < b.finalized_at ? -1 : 1));
  const nonScellees = (factures || []).filter(i => !i.chain_hash);
  if (nonScellees.length) {
    ko(`${nonScellees.length} facture(s) non scellees — lancer scripts/reprise-chaine-factures.js`);
    for (const i of nonScellees.slice(0, 6)) info(i.number);
  }
  let alterees = 0, rompues = 0;
  const vues = new Set([GENESIS]);
  for (const inv of scellees) {
    if (empreinte(canonique(inv), inv.chain_prev) !== inv.chain_hash) {
      alterees++; ko(`${inv.number} : le contenu ne correspond plus a son empreinte — PIECE ALTEREE`);
    }
    if (!vues.has(inv.chain_prev)) { rompues++; ko(`${inv.number} : accrochee a un maillon inexistant`); }
    vues.add(inv.chain_hash);
  }
  if (scellees.length && !alterees && !rompues) {
    ok(`${scellees.length} pieces scellees, chaine intacte de bout en bout`);
  }

  /* ── 3. Chaque commande payée a sa facture ────────────────────── */
  titre('3. Chaque commande payee reelle a-t-elle sa facture ?');
  const PAYES = ['paid', 'confirmed', 'preparing', 'partial', 'shipped', 'delivered', 'refunded'];
  const reelles = (commandes || []).filter(o => !o.is_test && !o.exclude_from_stats && PAYES.includes(o.status));
  const factureParOrder = {};
  for (const i of factures || []) {
    if (i.order_id && i.status !== 'avoir') factureParOrder[i.order_id] = i;
  }
  const sansFacture = reelles.filter(o => !factureParOrder[o.id]);
  if (!sansFacture.length) ok(`les ${reelles.length} commandes payees ont toutes leur facture`);
  else {
    ko(`${sansFacture.length} commande(s) payee(s) sans facture`);
    for (const o of sansFacture) info(`${o.order_number} (${o.status}, ${String(o.created_at).slice(0, 10)}) — ${o.customer_name || ''}`);
  }

  /* ── 4. Montant facture = montant commande ────────────────────── */
  titre('4. La facture dit-elle le meme montant que sa commande ?');
  let ecarts = 0;
  for (const o of reelles) {
    const inv = factureParOrder[o.id];
    if (!inv) continue;
    const fc = Math.abs(Number(inv.total_ttc) || 0);
    const cm = Math.abs(Number(o.total) || 0);
    /* Une commande modifiee par remboursement partiel garde sa facture
       d'origine + un avoir : la facture peut exceder la commande de ce
       qui a ete rembourse. */
    const rembourse = Number(o.refunded_amount) || 0;
    if (Math.abs(fc - cm) > 0.01 && Math.abs(fc - (cm + rembourse)) > 0.01) {
      ecarts++;
      ko(`${inv.number} : facture ${fc.toFixed(2)} EUR, commande ${o.order_number} ${cm.toFixed(2)} EUR (rembourse ${rembourse.toFixed(2)})`);
    }
  }
  if (!ecarts) ok('montants factures et commandes concordent (avoirs compris)');

  /* ── 5. Chaque remboursement a son avoir ──────────────────────── */
  titre('5. Chaque remboursement a-t-il son avoir ?');
  const avoirs = (factures || []).filter(i => i.status === 'avoir');
  const rembourses = reelles.filter(o => (Number(o.refunded_amount) || 0) > 0);
  const avoirParOrder = {};
  for (const a of avoirs) if (a.order_id) avoirParOrder[a.order_id] = (avoirParOrder[a.order_id] || 0) + Math.abs(Number(a.total_ttc) || 0);
  let sansAvoir = 0;
  for (const o of rembourses) {
    const couvert = avoirParOrder[o.id] || 0;
    const du = Number(o.refunded_amount) || 0;
    if (couvert + 0.01 < du) {
      sansAvoir++;
      ko(`${o.order_number} : ${du.toFixed(2)} EUR rembourses, avoirs pour ${couvert.toFixed(2)} EUR seulement`);
    }
  }
  if (!sansAvoir) ok(`${rembourses.length} remboursement(s), tous couverts par un avoir (${avoirs.length} avoir(s))`);

  /* ── 6. Mentions légales ──────────────────────────────────────── */
  titre('6. Les mentions obligatoires sont-elles la ?');
  let mentionsKo = 0;
  for (const i of factures || []) {
    const manques = [];
    if (!/293 B/.test(String(i.legal_mention || ''))) manques.push('mention art. 293 B');
    if (!i.seller_siret) manques.push('SIREN/SIRET vendeur');
    if (!i.seller_name) manques.push('nom vendeur');
    if (!i.client_name) manques.push('nom client');
    if (!i.date) manques.push('date');
    if (manques.length) { mentionsKo++; ko(`${i.number} : ${manques.join(', ')}`); }
  }
  if (!mentionsKo) ok('SIREN, identites, date et mention de franchise presents sur chaque piece');

  /* ── 7. Les recettes recoupent les encaissements ──────────────── */
  titre('7. Les recettes comptables recoupent-elles les commandes ?');
  const annee = new Date().getFullYear();
  /* Le net encaisse d'une commande n'est PAS toujours total - rembourse :
     un remboursement partiel avec reecriture (order_modified) a DEJA
     retire le montant du total. Le re-deduire compterait le
     remboursement deux fois — c'est le piege documente de ce module.
     Et une commande « refunded » d'avant la colonne refunded_amount
     porte 0 : son net est zero, pas son total. */
  const netDe = (o) => {
    const total = Number(o.total) || 0;
    const rembourse = Number(o.refunded_amount) || 0;
    if (o.status === 'refunded' && rembourse === 0) return 0;
    let dejaDansTotal = 0;
    try {
      const h = typeof o.refunds === 'string' ? JSON.parse(o.refunds) : (o.refunds || []);
      for (const r of Array.isArray(h) ? h : []) {
        if (r && r.order_modified) dejaDansTotal += Number(r.amount) || 0;
      }
    } catch { }
    return total - (rembourse - dejaDansTotal);
  };
  const encaisse = reelles
    .filter(o => String(o.created_at).startsWith(String(annee)))
    .reduce((s, o) => s + netDe(o), 0);
  const recettes = (ecritures || [])
    .filter(e => String(e.date).startsWith(String(annee)))
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const delta = Math.abs(encaisse - recettes);
  if (delta <= 0.01) ok(`${annee} : commandes nettes ${encaisse.toFixed(2)} EUR = recettes comptables ${recettes.toFixed(2)} EUR`);
  else {
    ko(`${annee} : commandes nettes ${encaisse.toFixed(2)} EUR, recettes comptables ${recettes.toFixed(2)} EUR (ecart ${delta.toFixed(2)})`);
    info('la synchronisation Comptabilite > Synchroniser recale ce total');
  }

  console.log('\n' + '='.repeat(59));
  console.log(alertes === 0
    ? '  Rien a signaler. La facturation est coherente de bout en bout.'
    : `  ${alertes} point(s) a regarder.`);
  console.log('='.repeat(59) + '\n');
})().catch(e => { console.error(e); process.exit(1); });
