/* ═══════════════════════════════════════════════════════════════
   TEST À L'ACIDE — le parcours complet d'une boutique NEUVE

   Contre l'instance pilote (base vierge installée par installer.js),
   via l'API de la vraie application montée en local : exactement ce
   qu'un marchand ferait, sans interface.

   produit → stock (réception) → vitrine → commande → expédition →
   facture scellée Factur-X → audits.
   ═══════════════════════════════════════════════════════════════ */

const BASE = 'http://localhost:3210';
const ADMIN = process.env.PILOTE_ADMIN;
const MDP = process.env.PILOTE_MDP;

const etapes = [];
let t0;
const top = () => (Date.now() - t0) / 1000;
const ok = (nom, detail) => { etapes.push([nom, detail]); console.log(`  [${top().toFixed(1)}s] ${nom} — ${detail}`); };
const fatal = (nom, detail) => { console.error(`  ÉCHEC ${nom} : ${detail}`); process.exit(1); };

(async () => {
  t0 = Date.now();
  console.log('═══ TEST À L\'ACIDE — boutique pilote ═══\n');

  /* 0. Le serveur répond */
  for (let i = 0; i < 30; i++) {
    try { const r = await fetch(BASE + '/login'); if (r.ok) break; } catch { }
    await new Promise(r => setTimeout(r, 2000));
    if (i === 29) fatal('serveur', 'ne répond pas');
  }
  ok('serveur', 'répond');

  /* 1. Connexion admin — compte jetable créé par l'installateur */
  const login = await fetch(BASE + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN, password: MDP }),
  }).then(r => r.json());
  if (!login.access_token) fatal('connexion', JSON.stringify(login));
  const H = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + login.access_token };
  ok('connexion admin', ADMIN);

  /* 2. Création d'un produit */
  const prodRes = await fetch(BASE + '/api/products', {
    method: 'POST', headers: H,
    body: JSON.stringify({
      name_fr: 'Sirop de sureau', name_sv: 'Flädersaft', name_en: 'Elderflower cordial',
      price: 6.5, is_active: true, track_stock: true, stock: 0, sort_order: 1,
    }),
  }).then(r => r.json());
  const produit = prodRes.product || prodRes;
  if (!produit?.id) fatal('produit', JSON.stringify(prodRes).slice(0, 200));
  ok('produit créé', produit.name_fr + ' (' + produit.id.slice(0, 8) + '…)');

  /* 3. Réception de marchandise — par le journal, comme la règle l'exige */
  const mv = await fetch(BASE + '/api/stock/movement', {
    method: 'POST', headers: H,
    body: JSON.stringify({ product_id: produit.id, delta: 10, reason: 'reception', reference: 'TEST-REC-1' }),
  }).then(r => r.json());
  if (!mv.ok) fatal('réception', JSON.stringify(mv));
  ok('réception +10', 'journalisée (TEST-REC-1)');

  /* 4. La vitrine annonce le disponible */
  const pub = await fetch(BASE + '/api/products').then(r => r.json());
  const vitrine = (pub.products || []).find(p => p.id === produit.id);
  if (!vitrine || vitrine.stock !== 10) fatal('vitrine', 'stock affiché ' + vitrine?.stock);
  ok('vitrine', 'stock public = 10 (disponible)');

  /* 5. Commande manuelle — 3 unités */
  const ordRes = await fetch(BASE + '/api/orders', {
    method: 'POST', headers: H,
    body: JSON.stringify({
      customer_name: 'Client Test', customer_email: 'client@test.local',
      status: 'paid', total: 19.5, subtotal: 19.5, shipping: 0,
      lines: [{ product_id: produit.id, name: 'Sirop de sureau', qty: 3, price: 6.5 }],
    }),
  }).then(r => r.json());
  const commande = ordRes.order;
  if (!commande?.id) fatal('commande', JSON.stringify(ordRes).slice(0, 200));
  ok('commande payée', commande.order_number + ' — facture ' + (ordRes.invoice_number || '?'));

  /* 6. Réservation : la vitrine descend à 7 SANS sortie de stock */
  const pub2 = await fetch(BASE + '/api/products').then(r => r.json());
  const v2 = (pub2.products || []).find(p => p.id === produit.id);
  if (v2.stock !== 7) fatal('réservation', 'vitrine à ' + v2.stock + ' au lieu de 7');
  ok('réservation', 'vitrine 10 → 7, le rayon n\'a pas bougé');

  /* 7. Expédition — la sortie de stock, par la route idempotente */
  const exp = await fetch(BASE + `/api/orders/${commande.id}/expedier`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ colis: { [produit.id]: 3 }, tout: true }),
  }).then(r => r.json());
  if (!exp.ok || exp.statut !== 'shipped') fatal('expédition', JSON.stringify(exp).slice(0, 200));
  ok('expédition', 'statut shipped, stock sorti sur ce qui part');

  /* 7bis. Rejeu : ne doit RIEN ressortir */
  const rejeu = await fetch(BASE + `/api/orders/${commande.id}/expedier`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ colis: { [produit.id]: 3 }, tout: true }),
  }).then(r => r.json());
  if (!rejeu.rejeu) fatal('rejeu', 'le double-clic a ressorti du stock !');
  ok('rejeu du double-clic', 'refusé proprement, rien de ressorti');

  /* 8. La facture est scellée et Factur-X */
  const invList = await fetch(BASE + '/api/invoices?order_id=' + commande.id, { headers: H }).then(r => r.json());
  const inv = (invList.invoices || [])[0];
  if (!inv) fatal('facture', 'introuvable');
  if (!inv.chain_hash) fatal('scellement', inv.number + ' sans chain_hash');
  ok('facture scellée', inv.number + ' — empreinte ' + inv.chain_hash.slice(0, 10) + '…');

  const fx = await fetch(BASE + `/api/invoices/${inv.id}/facturx`, { headers: H });
  const xml = await fx.text();
  if (!fx.ok || !xml.includes('urn:cen.eu:en16931:2017')) fatal('factur-x', xml.slice(0, 120));
  ok('Factur-X', 'XML EN 16931 émis (' + xml.length + ' o)');

  const pdf = await fetch(BASE + `/api/invoices/${inv.id}/pdf`, { headers: H });
  const buf = Buffer.from(await pdf.arrayBuffer());
  if (!pdf.ok || !buf.toString('latin1').includes('factur-x.xml')) fatal('pdf', 'sans factur-x.xml embarqué');
  ok('PDF/A-3', Math.round(buf.length / 1024) + ' Ko, factur-x.xml embarqué');

  console.log(`\n  Parcours complet en ${top().toFixed(1)}s. Lancer ensuite :`);
  console.log('    INSTANCE_URL=… INSTANCE_KEY=… node scripts/audit-stock.js');
  console.log('    INSTANCE_URL=… INSTANCE_KEY=… node scripts/audit-facturation.js');
})().catch(e => { console.error(e); process.exit(1); });
