'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';

const NAV = [
  { section: 'Boutique' },
  { href: '/admin',              icon: '📊', label: 'Tableau de bord' },
  { href: '/admin/produits',     icon: '📦', label: 'Produits' },
  { href: '/admin/categories',   icon: '🗂️', label: 'Catégories' },
  { href: '/admin/stock',        icon: '🔢', label: 'Stocks' },
  { href: '/admin/commandes',    icon: '🛒', label: 'Commandes' },
  { section: 'Contenu' },
  { href: '/admin/home-cms',     icon: '🏠', label: 'Page d\'accueil' },
  { href: '/admin/medias',       icon: '🖼️', label: 'Médiathèque' },
  { section: 'Gestion' },
  { href: '/admin/gestion',      icon: '🧾', label: 'Factures clients' },
  { href: '/admin/gestion',      icon: '📦', label: 'Achats fournisseurs', hash: '#achats' },
  { href: '/admin/gestion',      icon: '📈', label: 'Calcul des marges', hash: '#marges' },
  { href: '/admin/gestion',      icon: '🚚', label: 'Transport', hash: '#transport' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();
  const [email, setEmail]   = useState('');
  const [mobOpen, setMob]   = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('sd_admin_token');
    const mail  = localStorage.getItem('sd_admin_email');
    if (!token) { router.replace('/login'); return; }
    setEmail(mail || 'Admin');
    fetch('/api/auth/login', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => { if (!r.ok) { localStorage.clear(); router.replace('/login'); } });
  }, []);

  function logout() {
    localStorage.clear();
    router.replace('/login');
  }

  const initials = email.split('@')[0]?.slice(0,2).toUpperCase() || 'AD';

  return (
    <div className="admin-shell">
      <aside className={`sidebar ${mobOpen ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <span className="sidebar-logo-main">Svenska Delikatessen</span>
          <span className="sidebar-logo-tag">Back-office Admin</span>
        </div>
        <nav className="sidebar-nav">
          {NAV.map((item, i) => {
            if ('section' in item) {
              return <div key={i} className="nav-section-label">{item.section}</div>;
            }
            const isActive = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href));
            return (
              <Link
                key={i}
                href={item.hash ? item.href + item.hash : item.href}
                className={`nav-link ${isActive ? 'active' : ''}`}
                onClick={() => setMob(false)}
              >
                <span className="nav-link-icon">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
          <div className="nav-section-label" style={{ marginTop: 16 }}>Liens</div>
          <a href={process.env.NEXT_PUBLIC_FRONT_URL || 'https://thriving-pony-1275a9.netlify.app'} target="_blank" rel="noopener" className="nav-link">
            <span className="nav-link-icon">🌐</span>Voir le site
          </a>
          <a href="https://supabase.com/dashboard" target="_blank" rel="noopener" className="nav-link">
            <span className="nav-link-icon">🗄️</span>Supabase
          </a>
        </nav>
        <div className="sidebar-foot">
          <div className="sidebar-user">
            <div className="sidebar-avatar">{initials}</div>
            <div>
              <div className="sidebar-user-name">{email.split('@')[0]}</div>
              <div className="sidebar-user-role">Administrateur</div>
            </div>
            <button className="btn-logout" onClick={logout} title="Déconnexion">⏻</button>
          </div>
        </div>
      </aside>
      <main className="admin-main">
        <div style={{ display: 'none' }} className="mobile-topbar">
          <button onClick={() => setMob(!mobOpen)}>☰</button>
        </div>
        {children}
      </main>
      {mobOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 199 }}
          onClick={() => setMob(false)}
        />
      )}
    </div>
  );
}
