/* ═══════════════════════════════════════════════════════════════
   MARQUER UN COMPTE ADMIN

   Depuis le 22/10/2026, requireAuth (src/lib/auth.ts) n'ouvre les
   routes d'administration qu'aux comptes portant app_metadata.role =
   'admin' — un simple compte Supabase ne suffit plus (anciens comptes
   clients Google, par exemple).

   À lancer AVANT de déployer ce changement sur une instance dont
   l'admin existe déjà, sinon il est refusé à la connexion. Les
   nouvelles instances n'en ont pas besoin : installer.js pose le rôle.

   node scripts/marquer-admin.js                   → liste les comptes et leur rôle
   node scripts/marquer-admin.js <email>           → simulation
   node scripts/marquer-admin.js <email> --ecrire  → écriture
   Cible : .env.local par défaut, ou INSTANCE_URL / INSTANCE_KEY.
   ═══════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const env = (() => {
  try { return fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').replace(/\r/g, ''); }
  catch { return ''; }
})();
const lire = k => ((env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1] || '')
  .trim().replace(/^["']|["']$/g, '');
const sb = createClient(
  process.env.INSTANCE_URL || lire('NEXT_PUBLIC_SUPABASE_URL'),
  process.env.INSTANCE_KEY || lire('SUPABASE_SERVICE_ROLE_KEY'),
);

const ECRIRE = process.argv.includes('--ecrire');
const EMAIL = (process.argv.slice(2).find(a => !a.startsWith('--')) || '').trim().toLowerCase();

(async () => {
  const { data, error } = await sb.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const comptes = data.users || [];

  if (!EMAIL) {
    for (const u of comptes) {
      const prov = ((u.app_metadata && u.app_metadata.providers) || []).join(',');
      console.log(`${(u.app_metadata && u.app_metadata.role) === 'admin' ? 'ADMIN' : '     '}  ${u.email}  (${prov})`);
    }
    console.log(`\n${comptes.length} compte(s).`);
    return;
  }

  const u = comptes.find(x => (x.email || '').toLowerCase() === EMAIL);
  if (!u) throw new Error('aucun compte pour ' + EMAIL);
  if ((u.app_metadata || {}).role === 'admin') { console.log(`${EMAIL} est déjà admin.`); return; }
  console.log(`${EMAIL} → app_metadata.role = 'admin'`);
  if (!ECRIRE) { console.log('Rien écrit — relancer avec --ecrire.'); return; }

  const { error: e2 } = await sb.auth.admin.updateUserById(u.id, {
    app_metadata: { ...(u.app_metadata || {}), role: 'admin' },
  });
  if (e2) throw e2;
  console.log('Écrit.');
})().catch(e => { console.error('ÉCHEC :', e.message); process.exit(1); });
