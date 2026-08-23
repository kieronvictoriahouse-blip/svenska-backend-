/* ═══════════════════════════════════════════════════════════════
   AUDIT DU STOCK — « est-ce que mon stock est juste ? », en une commande

   Huit contrôles, tous en lecture seule. Rien n'est corrigé ici : un
   audit qui répare masque ce qu'il vient de trouver.

   Le modèle vérifié :
     stock     ce qui est physiquement en rayon
     réservé   dû à des commandes payées non expédiées
     vendable  stock − réservé, le seul chiffre opposable au client

   La marchandise ne sort du stock qu'à l'EXPÉDITION.

   ── Pourquoi une date de départ ──────────────────────────────────
   Avant le 13/08/2026, aucune vente ne laissait de mouvement. Un audit
   qui remonte plus loin signale 44 produits « en écart » et 35
   commandes « sans sortie » : ce sont des faits d'archive, pas des
   anomalies. Un audit qui crie tout le temps ne se lit plus. Les
   contrôles qui dépendent du journal commencent donc là, et le disent.

   node scripts/audit-stock.js
   ═══════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').replace(/\r/g, '');
const lire = k => ((env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1] || '')
  .trim().replace(/^["']|["']$/g, '');
/* INSTANCE_URL/INSTANCE_KEY permettent de viser n'importe quelle
   instance de la flotte — le control plane s'en servira tel quel. */
const sb = createClient(
  process.env.INSTANCE_URL || lire('NEXT_PUBLIC_SUPABASE_URL'),
  process.env.INSTANCE_KEY || lire('SUPABASE_SERVICE_ROLE_KEY'));

const J = v => { try { return Array.isArray(v) ? v : JSON.parse(v || '[]'); } catch { return []; } };
const DUS = ['paid', 'confirmed', 'preparing', 'partial'];
const PARTIES = ['shipped', 'delivered', 'partial'];

/* Mise en service du journal — cf. migration 031. */
const DEBUT = Date.parse('2026-08-13T00:00:00Z');
const depuisJournal = d => +new Date(d) >= DEBUT;

let alertes = 0;
const titre = t => console.log('\n' + t + '\n' + '-'.repeat(t.length));
const ok = m => console.log('   [ok] ' + m);
const ko = m => { alertes++; console.log('   [!!] ' + m); };
const info = m => console.log('        ' + m);

(async () => {
  const [{ data: produits }, { data: commandes }, { data: mouvements }] =
    await Promise.all([
      sb.from('products').select('id, sku, name_fr, stock, track_stock, is_active'),
      sb.from('orders').select('id, order_number, status, lines, shipped_qty, is_test, exclude_from_stats, created_at'),
      sb.from('stock_movements').select('*').order('created_at'),
    ]);

  const parId = Object.fromEntries((produits || []).map(p => [p.id, p]));
  const nom = id => (parId[id] ? `${parId[id].sku || '--'} ${parId[id].name_fr}` : `produit inconnu ${id}`);
  const vraie = o => !o.is_test && !o.exclude_from_stats && o.status !== 'cancelled';

  /* Réservé — même calcul que src/lib/reserve.ts. Si les deux
     divergent un jour, c'est ce fichier-ci qu'il faut corriger. */
  const reserve = {};
  for (const o of commandes || []) {
    if (o.is_test || !DUS.includes(o.status)) continue;
    const envoye = o.shipped_qty || {};
    for (const l of J(o.lines)) {
      if (!l.product_id) continue;
      const du = (Number(l.qty) || 0) - (Number(envoye[l.product_id]) || 0);
      if (du > 0) reserve[l.product_id] = (reserve[l.product_id] || 0) + du;
    }
  }

  console.log('===========================================================');
  console.log('  AUDIT DU STOCK -- ' + new Date().toISOString().slice(0, 10));
  console.log('===========================================================');
  console.log(`\n${(produits || []).length} produits | ${(commandes || []).length} commandes | ${(mouvements || []).length} mouvements`);
  console.log(`Journal en service depuis le 13/08/2026 — les contrôles 1, 2 et 5 s'y limitent.`);

  /* ── 1. La chaîne du journal tient-elle ? ─────────────────────────
     Un mouvement porte une photo avant/après. Deux mouvements
     consécutifs doivent se toucher (après de l'un = avant du suivant),
     et le dernier doit tomber sur le stock affiché. Toute écriture qui
     contourne le journal casse cette chaîne — c'est le seul contrôle
     qui détecte une modification faite dans le dos du système. */
  titre('1. La chaine du journal tient-elle ?');
  const parProduit = {};
  for (const m of mouvements || []) {
    if (m.qty_before === null || m.qty_before === undefined) continue;
    (parProduit[m.product_id] = parProduit[m.product_id] || []).push(m);
  }
  let ruptures = 0, fins = 0, controles = 0;
  for (const [pid, liste] of Object.entries(parProduit)) {
    const p = parId[pid];
    if (!p) continue;
    controles++;
    for (let i = 1; i < liste.length; i++) {
      if (Number(liste[i].qty_before) !== Number(liste[i - 1].qty_after)) {
        ruptures++;
        ko(`${nom(pid)} : le ${String(liste[i].created_at).slice(0, 10)}, le journal reprend a ${liste[i].qty_before} `
         + `alors qu'il s'etait arrete a ${liste[i - 1].qty_after} — une ecriture a contourne le journal`);
      }
    }
    const dernier = liste[liste.length - 1];
    if (Number(dernier.qty_after) !== Number(p.stock)) {
      fins++;
      ko(`${nom(pid)} : le journal finit a ${dernier.qty_after}, la fiche affiche ${p.stock}`);
    }
  }
  if (!ruptures && !fins) ok(`chaine intacte sur les ${controles} produits ayant un journal complet`);

  /* ── 1 bis. Un mouvement dit-il la vérité sur lui-même ? ──────────
     `delta` doit valoir `qty_after − qty_before`. Quand la route de
     mouvement plafonnait le stock à zéro, elle écrivait −1 en laissant
     0 → 0 : le journal annonçait une sortie qui n'avait pas eu lieu.
     La chaîne restait pourtant continue, donc le contrôle 1 ne voyait
     rien. Il fallait regarder le mouvement lui-même. */
  titre('1 bis. Un mouvement dit-il la verite sur lui-meme ?');
  /* Le plancher a zero (retire le 20/08/2026) ecrivait des deltas sans
     effet. Les 13 mouvements ecrits avant sont une histoire connue —
     leur marchandise correspond a la liste « comptage physique » du
     script de correction. On ne crie que sur du NOUVEAU : une alerte
     qu'aucune action ne peut eteindre finit par ne plus etre lue. */
  const SINCERITE = Date.parse('2026-08-21T00:00:00Z');
  const tousMenteurs = (mouvements || []).filter(m =>
    m.qty_before !== null && m.qty_after !== null && m.delta !== null &&
    Number(m.delta) !== Number(m.qty_after) - Number(m.qty_before));
  const menteurs = tousMenteurs.filter(m => +new Date(m.created_at) >= SINCERITE);
  const archives = tousMenteurs.length - menteurs.length;
  if (!menteurs.length) {
    ok('chaque mouvement recent annonce exactement ce quil a fait'
      + (archives ? ` (${archives} archives d'avant le 21/08, plancher a zero — connues)` : ''));
  } else {
    ko(`${menteurs.length} mouvement(s) annoncent une variation qu'ils n'ont pas faite`);
    for (const m of menteurs.slice(0, 12)) {
      info(`${String(m.created_at).slice(0, 19)} ${nom(m.product_id)} : delta ${m.delta}, `
         + `mais ${m.qty_before} -> ${m.qty_after} (${m.reason}${m.reference ? ' ' + m.reference : ''})`);
    }
    if (menteurs.length > 12) info(`… et ${menteurs.length - 12} autres`);
  }

  /* ── 1 ter. Une expédition a-t-elle sorti plus que le dû ? ────────
     Le vrai risque du modèle actuel : deux passes d'expédition sur la
     même commande. Le stock sort deux fois, la commande n'enregistre
     qu'un colis, et rien ne le signale. */
  titre('1 ter. Une expedition a-t-elle sorti plus que le du ?');

  /* On mesure l'effet REEL sur le rayon (qty_before − qty_after), pas la
     somme des deltas. Quand la route de mouvement plafonnait a zero, le
     delta annoncait −1 sans rien retirer : compter les deltas
     signalerait un surplus la ou rien n'est sorti. */
  const sorties = {};
  for (const m of mouvements || []) {
    if (m.reason !== 'picking' || !m.reference) continue;
    if (m.qty_before === null || m.qty_after === null) continue;
    const c = (sorties[m.reference] = sorties[m.reference] || {});
    c[m.product_id] = (c[m.product_id] || 0) + (Number(m.qty_before) - Number(m.qty_after));
  }

  /* Un surplus deja rendu n'est plus un probleme. Sans cette deduction,
     le controle crierait indefiniment sur un incident clos — et un
     controle qu'on ne peut pas satisfaire finit par ne plus etre lu. */
  const rendus = {};
  for (const m of mouvements || []) {
    if (m.reason !== 'Correction double expédition' || !m.reference) continue;
    const ref = String(m.reference).replace(/^CORR-/, '');
    const c = (rendus[ref] = rendus[ref] || {});
    c[m.product_id] = (c[m.product_id] || 0) + (Number(m.delta) || 0);
  }

  let exces = 0, soldes = 0;
  for (const [ref, parProduit] of Object.entries(sorties)) {
    const o = (commandes || []).find(x => x.order_number === ref);
    if (!o) continue;
    const du = {};
    for (const l of J(o.lines)) {
      if (l.product_id) du[l.product_id] = (du[l.product_id] || 0) + (Number(l.qty) || 0);
    }
    for (const [pid, sorti] of Object.entries(parProduit)) {
      const ecart = sorti - (du[pid] || 0);
      if (ecart <= 0) continue;
      const rendu = (rendus[ref] || {})[pid] || 0;
      if (rendu >= ecart) { soldes++; continue; }
      exces++;
      ko(`${ref} : ${nom(pid)} — ${du[pid] || 0} du, ${sorti} sorti (+${ecart - rendu} encore en trop)`);
    }
  }
  if (!exces) {
    ok('aucune expedition na sorti plus que ce qui etait du'
      + (soldes ? ` (${soldes} surplus passe(s), deja rendu(s))` : ''));
  }

  /* ── 2. Les nouveaux mouvements sont-ils complets ? ───────────── */
  titre('2. Les mouvements recents portent-ils leur photo ?');
  const recents = (mouvements || []).filter(m => depuisJournal(m.created_at));
  const aveugles = recents.filter(m => m.qty_before === null || m.qty_before === undefined);
  if (!aveugles.length) ok(`les ${recents.length} mouvements depuis le 13/08 sont complets`);
  else {
    const parMotif = {};
    for (const m of aveugles) parMotif[m.reason] = (parMotif[m.reason] || 0) + 1;
    ko(`${aveugles.length}/${recents.length} mouvements sans photo — le code qui les ecrit ne passe pas par adjustStock`);
    for (const [r, n] of Object.entries(parMotif).sort((a, b) => b[1] - a[1])) info(`${String(n).padStart(4)} x ${r}`);
  }

  /* ── 3. Promet-on plus qu'on n'a ? ────────────────────────────── */
  titre('3. Promet-on plus quon na ?');
  const negatifs = (produits || [])
    .map(p => ({ p, r: reserve[p.id] || 0, v: (Number(p.stock) || 0) - (reserve[p.id] || 0) }))
    .filter(x => x.v < 0);
  if (!negatifs.length) ok('aucun produit nest promis au-dela du stock');
  for (const x of negatifs) ko(`${nom(x.p.id)} : ${x.p.stock} en rayon, ${x.r} dus -> il en manque ${-x.v}`);

  /* ── 4. Le vendable est-il coherent partout ? ─────────────────── */
  titre('4. Ce que la boutique annonce');
  const enVente = (produits || []).filter(p => p.is_active && p.track_stock === true);
  const rupture = enVente.filter(p => (Number(p.stock) || 0) - (reserve[p.id] || 0) <= 0);
  const limite = enVente.filter(p => {
    const v = (Number(p.stock) || 0) - (reserve[p.id] || 0);
    return v > 0 && v <= 2;
  });
  ok(`${enVente.length} articles suivis en vente : ${rupture.length} en rupture, ${limite.length} en stock limite`);
  for (const p of rupture) info(`rupture : ${nom(p.id)} (${p.stock} en rayon, ${reserve[p.id] || 0} dus)`);

  /* ── 5. Marchandise partie sans sortie de stock ───────────────── */
  titre('5. Toute marchandise partie est-elle sortie du stock ?');
  const refs = new Set((mouvements || []).filter(m => m.reference).map(m => String(m.reference)));
  const sansSortie = (commandes || []).filter(o =>
    vraie(o) && PARTIES.includes(o.status) && depuisJournal(o.created_at) && !refs.has(o.order_number));
  if (!sansSortie.length) ok('chaque commande expediee depuis le 13/08 a sa sortie de stock');
  else {
    ko(`${sansSortie.length} commande(s) expediee(s) sans sortie de stock`);
    for (const o of sansSortie) info(`${o.order_number} (${o.status}, ${String(o.created_at).slice(0, 10)})`);
  }

  /* ── 6. Des ventes echappent-elles au suivi ? ─────────────────── */
  titre('6. Des ventes echappent-elles au suivi ?');
  const vendus = new Set();
  for (const o of commandes || []) {
    if (!vraie(o)) continue;
    for (const l of J(o.lines)) if (l.product_id) vendus.add(l.product_id);
  }
  const nonSuivis = [...vendus].filter(id => parId[id] && parId[id].track_stock !== true);
  if (!nonSuivis.length) ok('tout ce qui se vend est suivi en stock');
  else {
    ko(`${nonSuivis.length} produit(s) vendus sans suivi — ni compte, ni blocage, ni alerte`);
    for (const id of nonSuivis) info(`${nom(id)} (actif : ${parId[id].is_active ? 'oui' : 'non'}, stock ${parId[id].stock})`);
  }

  /* ── 7. Articles dus alors qu'ils sont retires ────────────────── */
  titre('7. Doit-on de la marchandise sur des articles retires ?');
  const dusInactifs = Object.keys(reserve).filter(id => parId[id] && !parId[id].is_active);
  if (!dusInactifs.length) ok('aucun article desactive nest encore du');
  for (const id of dusInactifs) {
    ko(`${nom(id)} : ${reserve[id]} dus, article desactive — invisible dans lecran Stocks`);
  }

  /* ── 8. Reservations qui dorment ──────────────────────────────── */
  titre('8. Des reservations dorment-elles ?');
  const vieilles = (commandes || []).filter(o =>
    !o.is_test && DUS.includes(o.status) &&
    (Date.now() - +new Date(o.created_at)) > 7 * 86400000);
  if (!vieilles.length) ok('aucune commande due depuis plus de 7 jours');
  for (const o of vieilles) {
    const jours = Math.floor((Date.now() - +new Date(o.created_at)) / 86400000);
    ko(`${o.order_number} — ${jours} jours en « ${o.status} », sa marchandise reste bloquee en reserve`);
  }

  console.log('\n' + '='.repeat(59));
  console.log(alertes === 0
    ? '  Rien a signaler. Le stock est coherent de bout en bout.'
    : `  ${alertes} point(s) a regarder.`);
  console.log('='.repeat(59) + '\n');
})().catch(e => { console.error(e); process.exit(1); });
