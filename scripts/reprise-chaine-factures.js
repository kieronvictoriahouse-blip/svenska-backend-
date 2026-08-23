/* ═══════════════════════════════════════════════════════════════
   REPRISE — scellement des factures existantes

   Le chaînage d'intégrité (migration 045) protège les factures à
   partir de sa mise en service. Les pièces émises AVANT doivent être
   scellées une fois, dans l'ordre chronologique d'émission, sinon la
   chaîne commence au milieu de l'histoire.

   L'ordre est : date d'émission, puis numéro. Après cette reprise,
   l'ordre de scellement (finalized_at) fait foi pour les suivantes.

   Même logique de hachage que src/lib/facture-integrite.ts — les deux
   DOIVENT produire la même empreinte, c'est vérifié par l'audit qui
   recalcule tout depuis le TypeScript compilé.

   node scripts/reprise-chaine-factures.js          → simulation
   node scripts/reprise-chaine-factures.js --ecrire → écriture
   ═══════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').replace(/\r/g, '');
const lire = k => ((env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1] || '')
  .trim().replace(/^["']|["']$/g, '');
const sb = createClient(lire('NEXT_PUBLIC_SUPABASE_URL'), lire('SUPABASE_SERVICE_ROLE_KEY'));
const ECRIRE = process.argv.includes('--ecrire');

/* ── Copie exacte de la canonicalisation de facture-integrite.ts ── */
const GENESIS = 'GENESIS';
const CHAMPS = ['number', 'date', 'client_name', 'client_email', 'client_address',
  'seller_name', 'seller_siret', 'total_ht', 'total_tva', 'total_ttc', 'legal_mention'];

function canonique(inv) {
  let lignes = [];
  try {
    const l = typeof inv.lines === 'string' ? JSON.parse(inv.lines) : (inv.lines || []);
    lignes = (Array.isArray(l) ? l : []).map(x => ({
      d: String(x.desc || x.name || ''),
      q: Number(x.qty) || 0,
      p: (Number(x.price) || 0).toFixed(2),
    }));
  } catch { /* lignes illisibles : vide */ }
  const base = {};
  for (const c of CHAMPS) {
    const v = inv[c];
    base[c] = ['total_ht', 'total_tva', 'total_ttc'].includes(c)
      ? (Number(v) || 0).toFixed(2) : String(v ?? '');
  }
  return JSON.stringify({ ...base, lignes });
}
const empreinte = (contenu, prev) =>
  createHash('sha256').update(prev + '\n' + contenu, 'utf8').digest('hex');

(async () => {
  const { data: toutes, error } = await sb.from('invoices').select('*');
  if (error) { console.error(error.message); process.exit(1); }

  const dejaScellees = (toutes || []).filter(i => i.chain_hash);
  const aSceller = (toutes || [])
    .filter(i => !i.chain_hash)
    .sort((a, b) => (a.date + a.number < b.date + b.number ? -1 : 1));

  console.log(ECRIRE ? '-- ECRITURE --' : '-- SIMULATION (ajouter --ecrire) --');
  console.log('factures :', (toutes || []).length,
    '| deja scellees :', dejaScellees.length,
    '| a sceller :', aSceller.length, '\n');

  if (!aSceller.length) { console.log('Rien a faire.'); return; }

  /* Le point d'accroche : la derniere pièce déjà scellée, sinon GENESIS. */
  let prev = GENESIS;
  if (dejaScellees.length) {
    prev = dejaScellees.sort((a, b) => (a.finalized_at < b.finalized_at ? 1 : -1))[0].chain_hash;
  }

  /* finalized_at doit suivre l'ordre de la chaîne : on espace d'une
     milliseconde, sinon deux pièces au même instant se relisent dans
     un ordre indéfini. */
  let t = Date.now();
  for (const inv of aSceller) {
    const hash = empreinte(canonique(inv), prev);
    console.log(` ${String(inv.number).padEnd(14)} ${inv.date}  ${String(inv.status).padEnd(9)} prev ${prev.slice(0, 10)}…  hash ${hash.slice(0, 10)}…`);
    if (ECRIRE) {
      const { error: e } = await sb.from('invoices')
        .update({ chain_hash: hash, chain_prev: prev, finalized_at: new Date(t++).toISOString() })
        .eq('id', inv.id).is('chain_hash', null);
      if (e) { console.error('  ECHEC :', e.message); process.exit(1); }
    }
    prev = hash;
  }

  console.log('\n' + (ECRIRE
    ? aSceller.length + ' facture(s) scellees. Verifier avec : node scripts/audit-facturation.js'
    : 'Rien ecrit — relancer avec --ecrire.'));
})().catch(e => { console.error(e); process.exit(1); });
