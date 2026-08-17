/* ═══════════════════════════════════════════════════════════════
   REPRISE DE LA LANGUE CLIENT

   Extrait le pays de chaque commande depuis son adresse de livraison —
   stockée sous deux formes incompatibles, objet JSON pour une partie des
   commandes et texte libre pour l'autre — et en déduit la langue.

   La reprise se fait ici et non en SQL : la 037 avait tenté la sienne en
   SQL et inséré zéro ligne sans rien signaler. Ici, on voit le résultat
   avant d'écrire.

   Ne touche jamais une commande dont la langue a été choisie à la main.

   node scripts/reprise-langue-client.js          → simulation
   node scripts/reprise-langue-client.js --ecrire → écriture
   ═══════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').replace(/\r/g, '');
const lire = k => ((env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1] || '')
  .trim().replace(/^["']|["']$/g, '');

const sb = createClient(lire('NEXT_PUBLIC_SUPABASE_URL'), lire('SUPABASE_SERVICE_ROLE_KEY'));
const ECRIRE = process.argv.includes('--ecrire');

/* Copie fidèle de src/lib/langue-client.ts : ce script tourne en CommonJS
   sans transpilation, il ne peut pas importer le module TypeScript. Toute
   correction faite là-bas doit être reportée ici. */
const NOMS_PAYS = {
  france: 'FR', frankrike: 'FR', francia: 'FR',
  sverige: 'SE', suede: 'SE', 'suède': 'SE', sweden: 'SE', schweden: 'SE',
  belgique: 'BE', belgium: 'BE', belgien: 'BE',
  suisse: 'CH', switzerland: 'CH', schweiz: 'CH',
  allemagne: 'DE', germany: 'DE', deutschland: 'DE',
  espagne: 'ES', spain: 'ES', espana: 'ES', 'españa': 'ES',
  italie: 'IT', italy: 'IT', italia: 'IT',
  'royaume-uni': 'GB', 'united kingdom': 'GB', angleterre: 'GB', england: 'GB',
  luxembourg: 'LU', 'pays-bas': 'NL', netherlands: 'NL', nederland: 'NL',
  irlande: 'IE', ireland: 'IE', danemark: 'DK', denmark: 'DK', danmark: 'DK',
  'norvège': 'NO', norvege: 'NO', norway: 'NO', norge: 'NO',
  finlande: 'FI', finland: 'FI', suomi: 'FI',
  portugal: 'PT', autriche: 'AT', austria: 'AT',
  pologne: 'PL', poland: 'PL', monaco: 'MC',
};
const PAYS_FR = new Set(['FR', 'BE', 'CH', 'LU', 'MC', 'GP', 'MQ', 'RE', 'YT', 'GF', 'NC', 'PF']);

function paysDeLivraison(o) {
  const direct = o.shipping_country || o.relay_point_pays;
  if (direct) return String(direct).trim().toUpperCase().slice(0, 2);

  let a = o.shipping_address ?? o.billing_address;
  if (typeof a === 'string' && a.trim().startsWith('{')) {
    try { a = JSON.parse(a); } catch { /* on retombe sur le texte */ }
  }
  if (a && typeof a === 'object') {
    const c = a.country || a.pays || a.country_code;
    if (c) {
      const brut = String(c).trim();
      return NOMS_PAYS[brut.toLowerCase()] || brut.toUpperCase().slice(0, 2);
    }
  }
  const texte = typeof a === 'string' ? a : '';
  if (texte) {
    const bouts = texte.split(',').map(s => s.trim()).filter(Boolean);
    const dernier = (bouts[bouts.length - 1] || '').toLowerCase();
    if (/^[a-z]{2}$/.test(dernier)) return dernier.toUpperCase();
    if (NOMS_PAYS[dernier]) return NOMS_PAYS[dernier];
    if (/\b\d{5}\b/.test(texte) && !/\b[A-Z]{1,2}\d/i.test(texte)) return 'FR';
  }
  return null;
}

const langueDePays = p => !p ? 'fr' : PAYS_FR.has(p) ? 'fr' : p === 'SE' ? 'sv' : 'en';

(async () => {
  const { data: commandes, error } = await sb.from('orders')
    .select('id, order_number, lang, shipping_country, shipping_address, billing_address, relay_point_pays');
  if (error) {
    console.error('Lecture impossible :', error.message);
    console.error('La migration 038 a-t-elle été appliquée ?');
    process.exit(1);
  }

  const aEcrire = [];
  const compte = {}, sansPays = [];
  let dejaChoisies = 0;

  for (const o of commandes || []) {
    /* Un choix manuel ne se recalcule jamais : sinon corriger la langue
       d'un client ne servirait qu'une fois. */
    if (o.lang) { dejaChoisies++; continue; }
    const pays = paysDeLivraison(o);
    const langue = langueDePays(pays);
    if (!pays) sansPays.push(o.order_number);
    compte[`${pays || '?'} → ${langue}`] = (compte[`${pays || '?'} → ${langue}`] || 0) + 1;
    aEcrire.push({ id: o.id, lang: langue, shipping_country: pays });
  }

  console.log(`${(commandes || []).length} commandes · ${dejaChoisies} déjà choisies à la main (intactes)`);
  console.log(`${aEcrire.length} à renseigner :\n`);
  for (const [k, v] of Object.entries(compte).sort((a, b) => b[1] - a[1])) {
    console.log('   ', k.padEnd(16), v);
  }
  if (sansPays.length) {
    console.log(`\n${sansPays.length} sans pays identifiable → français par défaut :`,
      sansPays.slice(0, 8).join(', '));
  }

  /* Les contacts portent déjà un pays : leur langue s'en déduit
     directement, et sert de repli aux commandes futures. */
  const { data: contacts } = await sb.from('contacts').select('id, country, lang').eq('type', 'client');
  const contactsAEcrire = (contacts || [])
    .filter(c => !c.lang && c.country)
    .map(c => ({ id: c.id, lang: langueDePays(String(c.country).trim().toUpperCase().slice(0, 2)) }));
  console.log(`\ncontacts clients : ${(contacts || []).length} · ${contactsAEcrire.length} à renseigner`);

  if (!ECRIRE) { console.log('\nSimulation. Relance avec --ecrire pour appliquer.'); return; }

  for (const l of aEcrire) {
    const { error } = await sb.from('orders')
      .update({ lang: l.lang, shipping_country: l.shipping_country }).eq('id', l.id);
    if (error) { console.error('Échec sur', l.id, ':', error.message); process.exit(1); }
  }
  for (const c of contactsAEcrire) {
    await sb.from('contacts').update({ lang: c.lang }).eq('id', c.id);
  }

  const { data: apres } = await sb.from('orders').select('lang');
  const bilan = {};
  for (const o of apres || []) bilan[o.lang || '(vide)'] = (bilan[o.lang || '(vide)'] || 0) + 1;
  console.log('\nÉcrit. Répartition finale :', JSON.stringify(bilan));
})();
