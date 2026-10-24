'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getAdminLang, setAdminLang, subscribeAdminLang, AdminLang } from '@/lib/admin-i18n';
import { getValidToken, adminFetch } from '@/lib/auth-client';
import { NavBadge, isFullBleed, isBare, ADMIN_SEARCH_EVENT } from '@/lib/admin-nav';
import { T } from '@/lib/admin-theme';
import AdminShell from './AdminShell';

/* Authentification, configuration boutique et compteurs de navigation.
   Le rendu est entièrement délégué à <AdminShell>.
   La bascule ordinateur / téléphone (900 px) est faite en CSS dans le
   shell : mesurée ici en JS, elle valait « ordinateur » au premier rendu
   et la sidebar apparaissait puis glissait à chaque chargement. */

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [email, setEmail] = useState('');
  const [siteName, setSiteName] = useState('');
  const [accent, setAccent] = useState(T.accentDefault);
  const [frontUrl, setFrontUrl] = useState('');
  const [lang, setLang] = useState<AdminLang>('fr');
  const [navOpen, setNavOpen] = useState(false);
  const [counts, setCounts] = useState<Record<NavBadge, number>>({ stock: 0, orders: 0, receptions: 0 });

  /* La query string est lue côté client : `useSearchParams()` ferait bailout
     le prérendu statique de TOUTES les pages admin (le layout les enveloppe). */
  const [search, setSearch] = useState('');
  useEffect(() => {
    const s = window.location.search;
    setSearch(prev => (prev === s ? prev : s));
  });

  useEffect(() => {
    setEmail(localStorage.getItem('sd_admin_email') || 'Admin');
    setLang(getAdminLang());
    getValidToken().then(token => {
      if (!token) { router.replace('/login'); return; }
      adminFetch('/api/auth/login', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => {
          if (!r.ok) {
            localStorage.removeItem('sd_admin_token');
            localStorage.removeItem('sd_admin_refresh_token');
            router.replace('/login');
          }
        });
    });
    adminFetch('/api/white-label')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const c = d?.config;
        if (!c) return;
        if (c.site_name) setSiteName(c.site_name);
        if (c.color_primary) setAccent(c.color_primary);
        if (c.front_url) setFrontUrl(c.front_url);
      })
      .catch(() => {});
    return subscribeAdminLang(setLang);
  }, []);

  /* Compteurs de la sidebar : données réelles, pas les valeurs de démo. */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [pRes, oRes] = await Promise.all([
          adminFetch('/api/products?limit=1000').then(r => r.json()).catch(() => ({})),
          adminFetch('/api/orders').then(r => r.json()).catch(() => ({})),
        ]);
        if (!alive) return;
        const products = pRes.products || [];
        const orders = oRes.orders || [];
        /* Seuil = `stock_alert` du produit, comme l'écran Stock (la colonne
           `low_stock_threshold` lue ici avant n'existe pas : tout tombait à 12). */
        /* Stock NULL d'un produit suivi = rupture, comme l'écran Stock et le
           tableau de bord. */
        const lowStock = products.filter((p: any) =>
          p.track_stock === true && (Number(p.stock) || 0) <= (p.stock_alert ?? 12)).length;
        /* « À traiter » = tout ce qui reste à expédier, la même liste que la
           file de la préparation (avant : payées + confirmées seulement, donc
           un badge à 15 pour une file de 16 et un filtre « À traiter » à 12). */
        const toProcess = orders.filter((o: any) =>
          !o.is_test && ['paid', 'confirmed', 'preparing', 'partial'].includes(o.status)).length;
        setCounts(c => ({ ...c, stock: lowStock, orders: toProcess }));
      } catch { /* compteurs non bloquants */ }
      try {
        /* Ce qui attend sa marchandise : les commandes d'achat envoyées ou
           confirmées. Avant, le badge comptait les réceptions qui ne sont ni
           « done » ni « received » — une réception naît « done », il ne
           restait donc que les réceptions ANNULÉES. */
        const pRes = await adminFetch('/api/purchase-orders').then(r => r.json());
        if (!alive) return;
        const pending = (pRes.orders || []).filter((po: any) =>
          ['sent', 'confirmed', 'partial'].includes(po.status)).length;
        setCounts(c => ({ ...c, receptions: pending }));
      } catch { /* route absente selon l'environnement */ }
    })();
    return () => { alive = false; };
  }, [pathname]);

  useEffect(() => { setNavOpen(false); }, [pathname, search]);

  // Documents A4 : aucun shell, la page occupe la feuille entière.
  if (isBare(pathname)) return <>{children}</>;

  return (
    <AdminShell
      pathname={pathname}
      search={search}
      navOpen={navOpen}
      setNavOpen={setNavOpen}
      siteName={siteName}
      email={email}
      accent={accent}
      frontUrl={frontUrl}
      lang={lang}
      onLang={l => { setLang(l); setAdminLang(l); }}
      counts={counts}
      fullBleed={isFullBleed(pathname)}
      onSearch={q => {
        /* La recherche annonce « produit, commande » : un n° de commande
           (SD-0240, #240, 240) ou un e-mail ouvre les commandes, le reste
           les produits. Avant, tout partait vers les produits. */
        const commande = q.includes('@') || /^#?\s*(sd\s*-?\s*)?\d{1,6}$/i.test(q);
        router.push(`/admin/${commande ? 'commandes' : 'produits'}?q=${encodeURIComponent(q)}`);
        // Liste déjà ouverte : elle ne relit pas l'URL, on lui passe la recherche.
        window.dispatchEvent(new CustomEvent(ADMIN_SEARCH_EVENT, { detail: q }));
      }}
      /* Appelé après confirmation dans le menu de l'avatar (plus au simple tap).
         La route efface aussi le cookie httpOnly, que le navigateur ne peut pas vider. */
      onLogout={async () => {
        const token = localStorage.getItem('sd_admin_token');
        try {
          await fetch('/api/auth/logout', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {} });
        } catch { /* hors ligne : on vide au moins le navigateur */ }
        localStorage.clear();
        router.replace('/login');
      }}
    >
      {children}
    </AdminShell>
  );
}
