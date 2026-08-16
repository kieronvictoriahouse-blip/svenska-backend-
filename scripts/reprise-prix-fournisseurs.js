/* ═══════════════════════════════════════════════════════════════
   REPRISE DES PRIX D'ACHAT PAR MAGASIN

   La 037 tentait cette reprise en SQL. Elle a inséré zéro ligne : la
   colonne `purchase_orders.lines` est du jsonb qui contient une CHAÎNE
   JSON, pas un tableau — `lines::text` commence donc par un guillemet,
   et le garde-fou l'écartait.

   Plutôt que de redonner du SQL non testable, la reprise se fait ici :
   même extraction que celle déjà validée sur l'historique, et on voit
   le résultat avant de l'écrire.

   Idempotent : relançable sans doublon (clé produit + magasin).

   node scripts/reprise-prix-fournisseurs.js          → simulation
   node scripts/reprise-prix-fournisseurs.js --ecrire → écriture
   ═══════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').replace(/\r/g, '');
const lire = k => ((env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1] || '')
  .trim().replace(/^["']|["']$/g, '');

const sb = createClient(lire('NEXT_PUBLIC_SUPABASE_URL'), lire('SUPABASE_SERVICE_ROLE_KEY'));
const ECRIRE = process.argv.includes('--ecrire');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const eur = n => n.toFixed(2).replace('.', ',') + ' €';

/** Le tableau de lignes, quelle que soit la façon dont il a été stocké. */
function lignesDe(brut) {
  let v = brut;
  for (let i = 0; i < 3 && typeof v === 'string'; i++) {
    try { v = JSON.parse(v); } catch { return []; }
  }
  return Array.isArray(v) ? v : [];
}

(async () => {
  const [{ data: commandes }, { data: magasins }, { data: produits }] = await Promise.all([
    sb.from('purchase_orders').select('number, status, supplier_id, lines, created_at'),
    sb.from('contacts').select('id, company').eq('type', 'supplier'),
    sb.from('products').select('id, name_fr, pack_size'),
  ]);

  const nomMagasin = Object.fromEntries((magasins || []).map(c => [c.id, c.company || '?']));
  const nomProduit = Object.fromEntries((produits || []).map(p => [p.id, p.name_fr]));

  /* Une commande annulée ne dit rien d'un prix pratiqué. */
  const retenues = (commandes || [])
    .filter(po => po.status !== 'cancelled' && po.supplier_id);

  const couples = new Map();   // produit|magasin → dernier prix connu

  for (const po of retenues) {
    for (const l of lignesDe(po.lines)) {
      const pid = String(l.product_id || '').trim();
      if (!UUID.test(pid) || !nomProduit[pid]) continue;

      const cout = Number(l.unit_cost_eur) || Number(l.unit_cost) || Number(l.price) || 0;
      if (cout <= 0) continue;

      const cle = `${pid}|${po.supplier_id}`;
      const vu = couples.get(cle);
      // On garde le prix le plus récent, et on compte tous les achats.
      if (!vu || new Date(po.created_at) > new Date(vu.date)) {
        couples.set(cle, {
          product_id: pid, supplier_id: po.supplier_id,
          cost_eur: Math.round(cout * 10000) / 10000,
          date: po.created_at, fois: (vu?.fois || 0) + 1,
        });
      } else {
        vu.fois++;
      }
    }
  }

  const lignes = [...couples.values()];

  /* Le magasin habituel : celui où l'on achète le plus souvent. Ce n'est
     pas forcément le moins cher — l'écran le signale. */
  const parProduit = {};
  for (const l of lignes) (parProduit[l.product_id] = parProduit[l.product_id] || []).push(l);
  for (const liste of Object.values(parProduit)) {
    liste.sort((a, b) => b.fois - a.fois || +new Date(b.date) - +new Date(a.date));
    liste[0].habituel = true;
  }

  const multi = Object.entries(parProduit).filter(([, l]) => l.length > 1);
  console.log(`${lignes.length} couples produit-magasin sur ${retenues.length} commandes retenues`);
  console.log(`${Object.keys(parProduit).length} produits, dont ${multi.length} achetés chez plusieurs magasins\n`);

  const gagnants = {};
  for (const [pid, liste] of multi) {
    const trie = [...liste].sort((a, b) => a.cost_eur - b.cost_eur);
    const bas = trie[0], haut = trie[trie.length - 1];
    gagnants[nomMagasin[bas.supplier_id]] = (gagnants[nomMagasin[bas.supplier_id]] || 0) + 1;
    const ecart = Math.round(((haut.cost_eur - bas.cost_eur) / bas.cost_eur) * 100);
    console.log(
      (nomProduit[pid] || pid).slice(0, 38).padEnd(40),
      trie.map(l => `${nomMagasin[l.supplier_id]} ${eur(l.cost_eur)}`).join('  |  ').padEnd(46),
      `+${ecart} %`,
    );
  }
  console.log('\nmoins cher le plus souvent :',
    Object.entries(gagnants).sort((a, b) => b[1] - a[1]).map(([n, c]) => `${n} ${c}×`).join(' · ') || '—');

  if (!ECRIRE) { console.log('\nSimulation. Relance avec --ecrire pour appliquer.'); return; }

  const { error } = await sb.from('product_suppliers').upsert(
    lignes.map(l => ({
      product_id: l.product_id, supplier_id: l.supplier_id,
      cost_eur: l.cost_eur, times_bought: l.fois,
      last_bought_at: l.date, is_preferred: !!l.habituel,
    })),
    { onConflict: 'product_id,supplier_id' },
  );
  if (error) { console.error('\nÉchec :', error.message); process.exit(1); }

  const { count } = await sb.from('product_suppliers').select('*', { count: 'exact', head: true });
  console.log(`\nÉcrit. product_suppliers contient ${count} couples.`);
})();
