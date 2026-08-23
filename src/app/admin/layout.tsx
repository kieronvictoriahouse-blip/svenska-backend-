'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getAdminLang, setAdminLang, subscribeAdminLang, AdminLang } from '@/lib/admin-i18n';
import { getValidToken, adminFetch } from '@/lib/auth-client';
import { NavBadge, isFullBleed, isBare } from '@/lib/admin-nav';
import { T } from '@/lib/admin-theme';
import AdminShell from './AdminShell';

/* Authentification, configuration boutique et compteurs de navigation.
   Le rendu est entièrement délégué à <AdminShell>. */

const MOBILE_BP = 900;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [email, setEmail] = useState('');
  const [siteName, setSiteName] = useState('');
  const [accent, setAccent] = useState(T.accentDefault);
  const [frontUrl, setFrontUrl] = useState('');
  const [lang, setLang] = useState<AdminLang>('fr');
  const [navOpen, setNavOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [counts, setCounts] = useState<Record<NavBadge, number>>({ stock: 0, orders: 0, receptions: 0 });

  /* La query string est lue côté client : `useSearchParams()` ferait bailout
     le prérendu statique de TOUTES les pages admin (le layout les enveloppe). */
  const [search, setSearch] = useState('');
  useEffect(() => {
    const s = window.location.search;
    setSearch(prev => (prev === s ? prev : s));
  });

  /* Bascule mobile mesurée en JS : le handoff pilote des comportements
     structurels avec ce seuil, pas seulement du style. */
  useEffect(() => {
    const onResize = () => setMobile(window.innerWidth < MOBILE_BP);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

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
        const lowStock = products.filter((p: any) =>
          p.track_stock === true && typeof p.stock === 'number' &&
          p.stock <= (Number(p.low_stock_threshold) || 12)).length;
        const toProcess = orders.filter((o: any) =>
          !o.is_test && ['paid', 'confirmed'].includes(o.status)).length;
        setCounts(c => ({ ...c, stock: lowStock, orders: toProcess }));
      } catch { /* compteurs non bloquants */ }
      try {
        const rRes = await adminFetch('/api/receptions').then(r => r.json());
        if (!alive) return;
        const pending = (rRes.receptions || []).filter((r: any) => r.status !== 'done' && r.status !== 'received').length;
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
      mobile={mobile}
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
      onSearch={q => router.push(`/admin/produits?q=${encodeURIComponent(q)}`)}
      onUserClick={() => { localStorage.clear(); router.replace('/login'); }}
    >
      {children}
    </AdminShell>
  );
}
