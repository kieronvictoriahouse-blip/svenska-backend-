import { createClient } from '@supabase/supabase-js';

/* La base du control plane — cp_clients / cp_instances / cp_evenements
   (cp-schema.sql). Distincte des bases d'instances : elle ne contient
   AUCUNE donnée de boutique, seulement l'usine. */
export const cp = createClient(
  process.env.CP_SUPABASE_URL || 'http://localhost',
  process.env.CP_SUPABASE_KEY || 'non-configure',
  {
    global: {
      /* Next met en cache les fetch GET — jusque SUR DISQUE entre deux
         redemarrages du serveur de dev. Un control plane qui lit sa
         file dans un cache provisionne des fantomes : ses lectures
         sont donc explicitement no-store. Constate en vrai : le tick
         voyait une instance supprimee une heure plus tot, et ses
         ecritures sur elle echouaient en silence. */
      fetch: (url, options) => fetch(url, { ...options, cache: 'no-store' }),
    },
  },
);

/** Le dépôt d'état attendu par lib/provisionneur.js. */
export function depot() {
  return {
    async majInstance(id: string, patch: Record<string, unknown>) {
      const { data, error } = await cp.from('cp_instances')
        .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).select('id');
      /* Une mise a jour qui ne touche AUCUNE ligne est une erreur d'etat
         (instance disparue ?) — pas un detail a avaler. */
      if (error || !data || !data.length) {
        throw new Error('majInstance ' + id + ' : ' + (error?.message || 'aucune ligne touchee'));
      }
    },
    async evenement(id: string, type: string, detail: unknown) {
      const { error } = await cp.from('cp_evenements').insert({ instance_id: id, type, detail });
      if (error) console.error('[cp] evenement non journalise :', error.message);
    },
  };
}
