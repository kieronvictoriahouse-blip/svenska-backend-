import { NextRequest, NextResponse } from 'next/server';
import { gzipSync } from 'zlib';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/* ═══════════════════════════════════════════════════════════════
   SAUVEGARDE QUOTIDIENNE — toutes les tables, chaque nuit

   Le plan gratuit de Supabase ne sauvegarde rien. Le 01/10/2026, le
   projet a été restreint (quota de bande passante) : toute l'API était
   coupée, et la boutique n'a été sauvée que parce que l'accès Postgres
   direct répondait encore. On ne compte plus sur la chance.

   Chaque nuit : toutes les tables du schéma public (+ les comptes
   d'authentification, sans mot de passe — l'API ne les donne pas) sont
   exportées en JSON, compressées, et rangées dans un bucket PRIVÉ
   `sauvegardes` du même projet, sous `AAAA-MM-JJ.json.gz`. On garde
   14 jours. Envoyer un fichier ne consomme pas le quota de bande
   passante (seuls les téléchargements comptent).

   Restauration : scripts/restaurer-sauvegarde.js (cible explicite,
   jamais implicite).

   Limite assumée : la sauvegarde vit dans le même projet. Elle protège
   d'une erreur (suppression, mauvaise manipulation, migration ratée),
   pas de la perte du projet entier. Pour ça : télécharger de temps en
   temps une sauvegarde sur un autre support (cf. script de restauration,
   option --telecharger).
   ═══════════════════════════════════════════════════════════════ */

const BUCKET = 'sauvegardes';
const GARDER_JOURS = 14;
const PAGE = 1000;

async function tablesPubliques(): Promise<string[]> {
  /* PostgREST décrit toutes les tables exposées dans son OpenAPI : c'est
     la seule façon de les lister sans accès SQL depuis une fonction. */
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const res = await fetch(`${url}/rest/v1/`, { headers: { apikey: cle, Authorization: `Bearer ${cle}` } });
  if (!res.ok) throw new Error(`OpenAPI PostgREST ${res.status}`);
  const j = await res.json();
  /* Les vues (v_…) se recalculent : on ne sauvegarde que les tables. */
  return Object.keys(j.definitions || {}).filter(t => !t.startsWith('v_')).sort();
}

async function lireTable(table: string): Promise<any[]> {
  const lignes: any[] = [];
  for (let debut = 0; ; debut += PAGE) {
    const { data, error } = await supabaseAdmin.from(table).select('*').range(debut, debut + PAGE - 1);
    if (error) throw new Error(`${table} : ${error.message}`);
    lignes.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return lignes;
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  const debut = Date.now();
  const jour = new Date().toISOString().slice(0, 10);
  const contenu: Record<string, any[]> = {};
  const echecs: string[] = [];

  try {
    for (const t of await tablesPubliques()) {
      try { contenu[t] = await lireTable(t); }
      catch (e: any) { echecs.push(e?.message || t); }
    }

    /* Comptes : identité, rôle et métadonnées (pas de mot de passe —
       après une restauration, chacun le réinitialise). */
    const comptes: any[] = [];
    for (let page = 1; page < 50; page++) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) { echecs.push(`auth.users : ${error.message}`); break; }
      comptes.push(...(data?.users || []).map(u => ({
        id: u.id, email: u.email, created_at: u.created_at,
        app_metadata: u.app_metadata, user_metadata: u.user_metadata,
      })));
      if (!data || data.users.length < 200) break;
    }
    contenu['auth.users'] = comptes;

    const json = JSON.stringify({ version: 1, cree_le: new Date().toISOString(), tables: contenu });
    const gz = gzipSync(Buffer.from(json, 'utf8'), { level: 9 });

    /* Bucket privé, créé au premier passage. */
    const { data: buckets } = await supabaseAdmin.storage.listBuckets();
    if (!(buckets || []).some(b => b.name === BUCKET)) {
      await supabaseAdmin.storage.createBucket(BUCKET, { public: false });
    }
    const { error: upErr } = await supabaseAdmin.storage.from(BUCKET)
      .upload(`${jour}.json.gz`, gz, { contentType: 'application/gzip', upsert: true });
    if (upErr) throw new Error(`Envoi de la sauvegarde : ${upErr.message}`);

    /* Rotation : on ne garde que les GARDER_JOURS dernières. */
    const { data: fichiers } = await supabaseAdmin.storage.from(BUCKET).list('', { limit: 1000 });
    const limite = new Date(Date.now() - GARDER_JOURS * 86400_000).toISOString().slice(0, 10);
    const vieux = (fichiers || []).map(f => f.name).filter(n => /^\d{4}-\d{2}-\d{2}\.json\.gz$/.test(n) && n.slice(0, 10) < limite);
    if (vieux.length) await supabaseAdmin.storage.from(BUCKET).remove(vieux);

    const lignes = Object.values(contenu).reduce((s, l) => s + l.length, 0);
    return NextResponse.json({
      ok: echecs.length === 0,
      fichier: `${BUCKET}/${jour}.json.gz`,
      tables: Object.keys(contenu).length,
      lignes,
      taille_ko: Math.round(gz.length / 1024),
      supprimees: vieux,
      duree_s: Math.round((Date.now() - debut) / 100) / 10,
      echecs,
    }, { status: echecs.length ? 207 : 200 });
  } catch (e: any) {
    console.error('[cron/sauvegarde]', e?.message || e);
    return NextResponse.json({ ok: false, erreur: e?.message || String(e), echecs }, { status: 500 });
  }
}
