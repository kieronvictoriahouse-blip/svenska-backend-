/* ═══════════════════════════════════════════════════════════════
   056 — RLS : « CONNECTÉ » NE VEUT PLUS DIRE « ADMIN »

   Les règles RLS « admin » testaient auth.role() = 'authenticated',
   vrai pour tout compte Supabase — y compris les anciens comptes
   clients (connexion Google de mai 2026). Elles réservent désormais
   l'accès aux comptes admin.

   Même règle que requireAuth (src/lib/auth.ts) : est admin le compte
   dont app_metadata.role = 'admin' (scripts/marquer-admin.js). Seule la
   clé de service écrit app_metadata, et elle contourne RLS : le
   back-office, qui passe tout par l'API, n'est pas concerné.

   On remplace la condition DANS chaque règle plutôt que la règle
   entière : une règle qui combinerait d'autres conditions les garde.
   Lu dans pg_policies, et non recopié du schéma, pour couvrir aussi
   une règle ajoutée à la main sur l'instance. Schéma public seulement.
   ═══════════════════════════════════════════════════════════════ */

do $$
declare
  r record;
  avant constant text := 'auth.role() = ''authenticated''::text';
  apres constant text := '((auth.jwt() -> ''app_metadata''::text) ->> ''role''::text) = ''admin''::text';
  n int := 0;
begin
  for r in
    select tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (position(avant in coalesce(qual, '')) > 0 or position(avant in coalesce(with_check, '')) > 0)
  loop
    if position(avant in coalesce(r.qual, '')) > 0 then
      execute format('alter policy %I on public.%I using (%s)',
        r.policyname, r.tablename, replace(r.qual, avant, apres));
    end if;
    if position(avant in coalesce(r.with_check, '')) > 0 then
      execute format('alter policy %I on public.%I with check (%s)',
        r.policyname, r.tablename, replace(r.with_check, avant, apres));
    end if;
    n := n + 1;
  end loop;
  raise notice '056 : % règle(s) RLS réservée(s) aux comptes admin', n;
end $$;
