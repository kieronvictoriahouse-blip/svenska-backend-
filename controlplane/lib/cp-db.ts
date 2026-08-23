import { createClient } from '@supabase/supabase-js';

/* La base du control plane — cp_clients / cp_instances / cp_evenements
   (cp-schema.sql). Distincte des bases d'instances : elle ne contient
   AUCUNE donnée de boutique, seulement l'usine. */
export const cp = createClient(
  process.env.CP_SUPABASE_URL || 'http://localhost',
  process.env.CP_SUPABASE_KEY || 'non-configure',
);

/** Le dépôt d'état attendu par lib/provisionneur.js. */
export function depot() {
  return {
    async majInstance(id: string, patch: Record<string, unknown>) {
      await cp.from('cp_instances').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
    },
    async evenement(id: string, type: string, detail: unknown) {
      await cp.from('cp_evenements').insert({ instance_id: id, type, detail });
    },
  };
}
