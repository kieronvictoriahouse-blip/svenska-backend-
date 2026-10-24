// ─────────────────────────────────────────────────────────────────────
//  Lecture complète d'une requête Supabase, par pages
//
//  PostgREST plafonne une réponse à 1000 lignes (max-rows) et ne le
//  signale pas : un export de l'exercice s'arrêtait à la 1000e écriture,
//  un total de trimestre aussi. `construire` rend une requête NEUVE à
//  chaque appel (un builder ne se relance pas deux fois) et doit porter
//  un ordre total — sans clé de départage, deux pages peuvent se
//  chevaucher ou sauter une ligne.
// ─────────────────────────────────────────────────────────────────────

export async function toutLire<T = any>(construire: () => any, page = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let debut = 0; ; debut += page) {
    const { data, error } = await construire().range(debut, debut + page - 1);
    if (error) throw new Error(error.message);
    out.push(...((data || []) as T[]));
    if (!data || data.length < page) break;
  }
  return out;
}
