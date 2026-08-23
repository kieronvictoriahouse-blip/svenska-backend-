import { cp } from '../../lib/cp-db';

export const dynamic = 'force-dynamic';

/* ═══════════════════════════════════════════════════════════════
   FLOTTE — « est-ce que tous mes clients vont bien ? » en un écran

   Lecture seule, protégée par clé (?cle=CP_ADMIN_KEY). C'est un
   tableau d'opérateur, pas un produit : l'authentification sérieuse
   viendra avec le premier employé — pour un opérateur seul, une clé
   longue dans un favori fait le travail sans fausse promesse.
   ═══════════════════════════════════════════════════════════════ */

const ETAPES: Record<string, string> = {
  a_faire: '⏳ en file', base_creee: '🔧 base créée', schema_joue: '🔧 schéma',
  seed_joue: '🔧 seed', installe: '🔧 installée', vercel_cree: '🔧 Vercel',
  env_posees: '🔧 env', pret: '✅ prête', echec: '⛔ échec',
};

export default async function Flotte({ searchParams }: { searchParams: { cle?: string } }) {
  if (!process.env.CP_ADMIN_KEY || searchParams.cle !== process.env.CP_ADMIN_KEY) {
    return <main style={{ padding: 40, fontFamily: 'system-ui' }}>Accès refusé.</main>;
  }

  const [{ data: instances }, { data: evenements }] = await Promise.all([
    cp.from('cp_instances').select('*, cp_clients(nom_boutique, email, statut, sous_domaine)')
      .order('created_at', { ascending: false }),
    cp.from('cp_evenements').select('*').order('created_at', { ascending: false }).limit(30),
  ]);

  const td: React.CSSProperties = { padding: '8px 12px', borderBottom: '1px solid #E8E0D0', fontSize: 13 };

  return (
    <main style={{ maxWidth: 1000, margin: '0 auto', padding: '40px 20px', fontFamily: 'Jost, system-ui, sans-serif', color: '#1B2118' }}>
      <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 26 }}>Flotte — {(instances || []).length} instance(s)</h1>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 18 }}>
        <thead>
          <tr>{['Boutique', 'Abonnement', 'Provisionnement', 'Admin', 'Erreur'].map(h => (
            <th key={h} style={{ ...td, textAlign: 'left', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em', color: '#8B8371' }}>{h}</th>
          ))}</tr>
        </thead>
        <tbody>
          {(instances || []).map((i: any) => (
            <tr key={i.id}>
              <td style={td}><strong>{i.cp_clients?.nom_boutique}</strong><br />
                <span style={{ color: '#8B8371', fontSize: 12 }}>{i.cp_clients?.sous_domaine}.shopflow.fr · {i.cp_clients?.email}</span></td>
              <td style={td}>{i.cp_clients?.statut}</td>
              <td style={td}>{ETAPES[i.etape] || i.etape}</td>
              <td style={td}>{i.url_admin ? <a href={i.url_admin}>{i.url_admin.replace('https://', '')}</a> : '—'}</td>
              <td style={{ ...td, color: '#B03A2E', maxWidth: 260 }}>{i.erreur || ''}</td>
            </tr>
          ))}
          {!(instances || []).length && <tr><td style={td} colSpan={5}>Aucune instance — la première viendra de l&rsquo;inscription.</td></tr>}
        </tbody>
      </table>

      <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 19, marginTop: 34 }}>Journal</h2>
      <div style={{ fontSize: 12.5, lineHeight: 1.9, color: '#5F5A4E' }}>
        {(evenements || []).map((e: any) => (
          <div key={e.id}>
            <span style={{ color: '#8B8371' }}>{String(e.created_at).slice(0, 19).replace('T', ' ')}</span>
            {'  '}<strong>{e.type}</strong>
            {e.detail ? '  ' + JSON.stringify(e.detail).slice(0, 110) : ''}
          </div>
        ))}
      </div>
    </main>
  );
}
