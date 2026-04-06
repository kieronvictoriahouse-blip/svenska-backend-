'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';

const NAV = [
  { href: '/admin/apps', icon: '🏠', label: 'Applications' },
  { section: '🛍️ Boutique' },
  { href: '/admin', icon: '📊', label: 'Tableau de bord', exact: true },
  { href: '/admin/produits', icon: '📦', label: 'Produits' },
  { href: '/admin/categories', icon: '🗂️', label: 'Catégories' },
  { href: '/admin/stock', icon: '🔢', label: 'Stocks' },
  { href: '/admin/commandes', icon: '🛒', label: 'Commandes' },
  { section: '👥 Contacts' },
  { href: '/admin/contacts?type=client', icon: '👤', label: 'Clients' },
  { href: '/admin/contacts?type=supplier', icon: '🏭', label: 'Fournisseurs' },
  { section: '📦 Achats' },
  { href: '/admin/achats', icon: '🛍️', label: 'Commandes achat' },
  { href: '/admin/receptions', icon: '📬', label: 'Réceptions' },
  { section: '💰 Finance' },
  { href: '/admin/gestion', icon: '🧾', label: 'Factures vente' },
  { href: '/admin/gestion', icon: '📄', label: 'Factures achat' },
  { href: '/admin/gestion', icon: '📈', label: 'Marges' },
  { section: '📣 Marketing' },
  { href: '/admin/marketing', icon: '📧', label: 'Campagnes' },
  { href: '/admin/marketing?tab=promo', icon: '🎟️', label: 'Codes promo' },
  { href: '/admin/marketing?tab=cart', icon: '🛒', label: 'Abandon panier' },
  { section: '🌐 Contenu' },
  { href: '/admin/home-cms', icon: '🏠', label: 'Page d\'accueil' },
  { href: '/admin/medias', icon: '🖼️', label: 'Médiathèque' },
  { section: '⚙️ Config' },
  { href: '/admin/white-label', icon: '🎨', label: 'White Label' },
  { href: '/admin/white-label?tab=import', icon: '📥', label: 'Import données' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [email, setEmail] = useState('');
  const [mobOpen, setMob] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('sd_admin_token');
    const mail = localStorage.getItem('sd_admin_email');
    if (!token) { router.replace('/login'); return; }
    setEmail(mail || 'Admin');
    fetch('/api/auth/login', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => { if (!r.ok) { localStorage.clear(); router.replace('/login'); } });
  }, []);

  function logout() { localStorage.clear(); router.replace('/login'); }

  const initials = email.split('@')[0]?.slice(0, 2).toUpperCase() || 'AD';

  const css = `
    .admin-shell { display: flex; min-height: 100vh; background: #EDEAE4; }
    .sidebar { width: ${collapsed ? '60px' : '220px'}; background: #1C2028; display: flex; flex-direction: column; position: fixed; top: 0; left: 0; bottom: 0; z-index: 100; transition: width 0.2s; overflow: hidden; }
    .sidebar-logo { padding: 16px ${collapsed ? '0' : '20px'}; border-bottom: 1px solid rgba(255,255,255,0.06); display: flex; align-items: center; justify-content: ${collapsed ? 'center' : 'space-between'}; }
    .sidebar-logo-main { font-family: 'Cormorant Garamond', serif; font-size: 15px; font-weight: 600; color: #fff; display: ${collapsed ? 'none' : 'block'}; }
    .sidebar-logo-tag { font-size: 9px; letter-spacing: 3px; text-transform: uppercase; color: #BC7455; display: ${collapsed ? 'none' : 'block'}; margin-top: 2px; }
    .collapse-btn { background: none; border: none; color: rgba(255,255,255,0.4); cursor: pointer; font-size: 14px; padding: 4px; border-radius: 4px; }
    .collapse-btn:hover { color: #fff; background: rgba(255,255,255,0.1); }
    .sidebar-nav { flex: 1; padding: 8px 0; overflow-y: auto; overflow-x: hidden; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.1) transparent; }
    .nav-section-label { font-size: 9px; letter-spacing: 3px; text-transform: uppercase; color: rgba(255,255,255,0.2); padding: 10px ${collapsed ? '0' : '20px'} 4px; text-align: ${collapsed ? 'center' : 'left'}; display: ${collapsed ? 'none' : 'block'}; }
    .nav-link { display: flex; align-items: center; gap: 9px; padding: 8px ${collapsed ? '0' : '20px'}; font-size: 12.5px; font-weight: 500; color: rgba(255,255,255,0.5); text-decoration: none; border-left: 3px solid transparent; transition: all 0.15s; white-space: nowrap; justify-content: ${collapsed ? 'center' : 'flex-start'}; }
    .nav-link:hover { color: #fff; background: rgba(255,255,255,0.05); }
    .nav-link.active { color: #fff; background: rgba(255,255,255,0.08); border-left-color: #BC7455; }
    .nav-link-icon { font-size: 14px; width: 18px; text-align: center; flex-shrink: 0; }
    .nav-link-label { display: ${collapsed ? 'none' : 'block'}; }
    .sidebar-foot { padding: 12px ${collapsed ? '0' : '16px'}; border-top: 1px solid rgba(255,255,255,0.06); }
    .sidebar-user { display: flex; align-items: center; gap: 8px; justify-content: ${collapsed ? 'center' : 'flex-start'}; }
    .sidebar-avatar { width: 30px; height: 30px; border-radius: 50%; background: #3E5238; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; flex-shrink: 0; }
    .sidebar-user-info { display: ${collapsed ? 'none' : 'block'}; flex: 1; min-width: 0; }
    .sidebar-user-name { font-size: 12px; font-weight: 600; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sidebar-user-role { font-size: 10px; color: rgba(255,255,255,0.3); }
    .btn-logout { background: none; border: none; color: rgba(255,255,255,0.3); cursor: pointer; font-size: 14px; padding: 4px; display: ${collapsed ? 'none' : 'block'}; }
    .btn-logout:hover { color: #fff; }
    .admin-main { margin-left: ${collapsed ? '60px' : '220px'}; flex: 1; padding: 28px; min-height: 100vh; transition: margin-left 0.2s; }
    @media(max-width: 768px) {
      .sidebar { transform: ${mobOpen ? 'translateX(0)' : 'translateX(-100%)'}; width: 220px !important; }
      .admin-main { margin-left: 0 !important; padding: 16px; }
      .sidebar-logo-main, .sidebar-logo-tag, .nav-link-label, .nav-section-label, .sidebar-user-info, .btn-logout { display: block !important; }
      .sidebar-user { justify-content: flex-start !important; }
    }
  `;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="admin-shell">
        <aside className={`sidebar ${mobOpen ? 'open' : ''}`}>
          <div className="sidebar-logo">
            <div>
              <div className="sidebar-logo-main">Svenska</div>
              <div className="sidebar-logo-tag">ERP Admin</div>
            </div>
            <button className="collapse-btn" onClick={() => setCollapsed(!collapsed)} title={collapsed ? 'Agrandir' : 'Réduire'}>
              {collapsed ? '→' : '←'}
            </button>
          </div>

          <nav className="sidebar-nav">
            {NAV.map((item, i) => {
              if ('section' in item) {
                return <div key={i} className="nav-section-label">{item.section}</div>;
              }
              const isActive = item.exact
                ? pathname === item.href
                : pathname.startsWith(item.href.split('?')[0]) && item.href !== '/admin/apps';
              return (
                <Link key={i} href={item.href}
                  className={`nav-link ${isActive ? 'active' : ''}`}
                  onClick={() => setMob(false)}
                  title={collapsed ? item.label : undefined}>
                  <span className="nav-link-icon">{item.icon}</span>
                  <span className="nav-link-label">{item.label}</span>
                </Link>
              );
            })}

            <div className="nav-section-label">🔗 Liens</div>
            <a href="https://thriving-pony-1275a9.netlify.app" target="_blank" rel="noopener" className="nav-link" title={collapsed ? 'Voir le site' : undefined}>
              <span className="nav-link-icon">🌐</span><span className="nav-link-label">Voir le site</span>
            </a>
            <a href="https://supabase.com/dashboard" target="_blank" rel="noopener" className="nav-link" title={collapsed ? 'Supabase' : undefined}>
              <span className="nav-link-icon">🗄️</span><span className="nav-link-label">Supabase</span>
            </a>
          </nav>

          <div className="sidebar-foot">
            <div className="sidebar-user">
              <div className="sidebar-avatar">{initials}</div>
              <div className="sidebar-user-info">
                <div className="sidebar-user-name">{email.split('@')[0]}</div>
                <div className="sidebar-user-role">Administrateur</div>
              </div>
              <button className="btn-logout" onClick={logout} title="Déconnexion">⏻</button>
            </div>
          </div>
        </aside>

        <main className="admin-main">
          {mobOpen && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 99 }} onClick={() => setMob(false)} />
          )}
          {children}
        </main>
      </div>
    </>
  );
}
