'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';

const APPS = [
  {
    key: 'boutique',
    label: 'Boutique',
    icon: '🛍️',
    color: '#7B4F7B',
    paths: ['/admin/produits', '/admin/categories', '/admin/stock', '/admin/commandes', '/admin/import'],
    nav: [
      { href: '/admin/produits',  icon: '📦', label: 'Produits' },
      { href: '/admin/categories',icon: '🗂️', label: 'Catégories' },
      { href: '/admin/stock',     icon: '🔢', label: 'Stocks' },
      { href: '/admin/commandes', icon: '🛒', label: 'Commandes' },
      { href: '/admin/import',    icon: '📥', label: 'Import URL' },
    ],
  },
  {
    key: 'achats',
    label: 'Achats',
    icon: '📬',
    color: '#1A6B55',
    paths: ['/admin/achats', '/admin/receptions'],
    nav: [
      { href: '/admin/achats',     icon: '🛍️', label: 'Commandes achat' },
      { href: '/admin/receptions', icon: '📬', label: 'Réceptions' },
    ],
  },
  {
    key: 'finance',
    label: 'Finance',
    icon: '💰',
    color: '#1C4E80',
    paths: ['/admin/gestion'],
    nav: [
      { href: '/admin/gestion',            icon: '🧾', label: 'Factures vente' },
      { href: '/admin/gestion?tab=achat',  icon: '📄', label: 'Factures achat' },
      { href: '/admin/gestion?tab=marges', icon: '📈', label: 'Marges' },
    ],
  },
  {
    key: 'marketing',
    label: 'Marketing',
    icon: '📣',
    color: '#7B2D8B',
    paths: ['/admin/marketing'],
    nav: [
      { href: '/admin/marketing',             icon: '📧', label: 'Campagnes' },
      { href: '/admin/marketing?tab=promo',   icon: '🎟️', label: 'Codes promo' },
      { href: '/admin/marketing?tab=cart',    icon: '🛒', label: 'Abandon panier' },
    ],
  },
  {
    key: 'contenu',
    label: 'Contenu',
    icon: '🖼️',
    color: '#8B5E3C',
    paths: ['/admin/home-cms', '/admin/medias', '/admin/homepage'],
    nav: [
      { href: '/admin/home-cms', icon: '🏠', label: 'Page d\'accueil' },
      { href: '/admin/medias',   icon: '🖼️', label: 'Médiathèque' },
    ],
  },
  {
    key: 'contacts',
    label: 'Contacts',
    icon: '👥',
    color: '#5B3427',
    paths: ['/admin/contacts'],
    nav: [
      { href: '/admin/contacts?type=client',   icon: '👤', label: 'Clients' },
      { href: '/admin/contacts?type=supplier', icon: '🏭', label: 'Fournisseurs' },
    ],
  },
  {
    key: 'config',
    label: 'Configuration',
    icon: '⚙️',
    color: '#424242',
    paths: ['/admin/white-label'],
    nav: [
      { href: '/admin/white-label',             icon: '🎨', label: 'White Label' },
      { href: '/admin/white-label?tab=import',  icon: '📥', label: 'Import données' },
    ],
  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [email, setEmail] = useState('');
  const [siteName, setSiteName] = useState('Heather & Lingon');
  const [mobOpen, setMob] = useState(false);

  const isHome = pathname === '/admin';

  const currentApp = isHome ? null : APPS.find(app =>
    app.paths.some(p => pathname.startsWith(p))
  ) || null;

  useEffect(() => {
    const token = localStorage.getItem('sd_admin_token');
    const mail = localStorage.getItem('sd_admin_email');
    if (!token) { router.replace('/login'); return; }
    setEmail(mail || 'Admin');
    fetch('/api/auth/login', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => { if (!r.ok) { localStorage.clear(); router.replace('/login'); } });
    fetch('/api/white-label')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.config?.site_name) setSiteName(data.config.site_name); })
      .catch(() => {});
  }, []);

  // Fermer la sidebar au changement de page
  useEffect(() => { setMob(false); }, [pathname]);

  function logout() { localStorage.clear(); router.replace('/login'); }

  const initials = email.split('@')[0]?.slice(0, 2).toUpperCase() || 'AD';
  const appColor = currentApp?.color || '#7B4F7B';

  const css = `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Jost', -apple-system, sans-serif; background: #F0EDE8; }

    /* TOP BAR */
    .topnav {
      position: fixed; top: 0; left: 0; right: 0; z-index: 200;
      height: 52px;
      background: #1C2028;
      display: flex; align-items: center; gap: 0;
      box-shadow: 0 2px 8px rgba(0,0,0,0.25);
    }
    .topnav-brand {
      display: flex; align-items: center; gap: 10px;
      padding: 0 20px; height: 100%;
      border-right: 1px solid rgba(255,255,255,0.07);
      text-decoration: none; min-width: 200px;
    }
    .topnav-brand-icon {
      width: 32px; height: 32px; border-radius: 8px;
      background: ${appColor}; display: flex; align-items: center; justify-content: center;
      font-size: 16px; transition: background 0.3s;
    }
    .topnav-brand-text { display: flex; flex-direction: column; }
    .topnav-brand-main { font-size: 14px; font-weight: 700; color: #fff; letter-spacing: 0.3px; }
    .topnav-brand-sub  { font-size: 9px; letter-spacing: 2.5px; text-transform: uppercase; color: rgba(255,255,255,0.3); }

    .topnav-home {
      display: flex; align-items: center; justify-content: center;
      width: 52px; height: 52px; color: rgba(255,255,255,0.5);
      text-decoration: none; font-size: 18px; transition: all 0.15s;
      border-right: 1px solid rgba(255,255,255,0.07);
      flex-shrink: 0;
    }
    .topnav-home:hover { background: rgba(255,255,255,0.08); color: #fff; }
    .topnav-home.active { background: rgba(255,255,255,0.1); color: #fff; }

    .topnav-app {
      display: flex; align-items: center; gap: 8px;
      padding: 0 18px; height: 100%;
      font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.85);
      border-right: 1px solid rgba(255,255,255,0.07);
    }
    .topnav-app-dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: ${appColor}; flex-shrink: 0;
    }

    .topnav-spacer { flex: 1; }

    .topnav-link {
      display: flex; align-items: center; gap: 6px;
      padding: 0 14px; height: 100%;
      font-size: 12px; color: rgba(255,255,255,0.4);
      text-decoration: none; transition: all 0.15s;
    }
    .topnav-link:hover { color: #fff; background: rgba(255,255,255,0.06); }

    .topnav-user {
      display: flex; align-items: center; gap: 10px;
      padding: 0 16px; height: 100%;
      border-left: 1px solid rgba(255,255,255,0.07);
      cursor: pointer;
    }
    .topnav-avatar {
      width: 30px; height: 30px; border-radius: 50%;
      background: ${appColor}; color: #fff;
      display: flex; align-items: center; justify-content: center;
      font-size: 11px; font-weight: 700; flex-shrink: 0;
      transition: background 0.3s;
    }
    .topnav-user-name { font-size: 12px; font-weight: 500; color: rgba(255,255,255,0.7); }
    .topnav-logout {
      background: none; border: none; color: rgba(255,255,255,0.3);
      cursor: pointer; font-size: 14px; padding: 4px; border-radius: 4px;
      transition: all 0.15s;
    }
    .topnav-logout:hover { color: #fff; background: rgba(255,255,255,0.1); }

    /* SHELL */
    .admin-shell { display: flex; min-height: 100vh; padding-top: 52px; }

    /* MODULE SIDEBAR */
    .module-sidebar {
      width: 200px; background: #fff; position: fixed;
      top: 52px; left: 0; bottom: 0; z-index: 100;
      border-right: 1px solid #E8E4DE;
      display: flex; flex-direction: column;
      overflow-y: auto;
    }
    .module-sidebar-header {
      padding: 16px 16px 10px;
      font-size: 9px; letter-spacing: 3px; text-transform: uppercase;
      color: #A09688; font-weight: 600; border-bottom: 1px solid #F0EDE8;
    }
    .module-nav { padding: 6px 0; }
    .module-nav-link {
      display: flex; align-items: center; gap: 10px;
      padding: 9px 16px; font-size: 13px; font-weight: 500;
      color: #5A5248; text-decoration: none;
      border-left: 3px solid transparent;
      transition: all 0.15s;
    }
    .module-nav-link:hover { background: #F8F5F0; color: #1C2028; }
    .module-nav-link.active {
      background: #F0EDE8; color: ${appColor};
      border-left-color: ${appColor}; font-weight: 600;
    }
    .module-nav-icon { font-size: 15px; width: 20px; text-align: center; flex-shrink: 0; }

    /* MAIN CONTENT */
    .admin-main {
      flex: 1; min-height: calc(100vh - 52px);
      background: #F0EDE8;
      margin-left: ${!isHome && currentApp ? '200px' : '0'};
      padding: ${isHome ? '0' : '28px'};
      transition: margin-left 0.2s;
    }

    /* HOME LAUNCHER */
    .launcher {
      min-height: calc(100vh - 52px);
      background: linear-gradient(135deg, #1C2028 0%, #2D3748 100%);
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      padding: 60px 40px;
    }
    .launcher-welcome {
      text-align: center; margin-bottom: 60px;
    }
    .launcher-flag { font-size: 48px; margin-bottom: 16px; }
    .launcher-title {
      font-family: 'Cormorant Garamond', serif;
      font-size: 42px; font-weight: 300; color: #fff;
      margin-bottom: 8px;
    }
    .launcher-title em { font-style: italic; color: #AA4455; }
    .launcher-sub {
      font-size: 14px; color: rgba(255,255,255,0.35);
      letter-spacing: 1px;
    }
    .launcher-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      max-width: 860px;
      width: 100%;
    }
    .app-tile {
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 16px;
      padding: 28px 20px;
      text-align: center;
      text-decoration: none;
      cursor: pointer;
      transition: all 0.22s;
      display: flex; flex-direction: column; align-items: center; gap: 14px;
    }
    .app-tile:hover {
      background: rgba(255,255,255,0.11);
      border-color: rgba(255,255,255,0.2);
      transform: translateY(-4px);
      box-shadow: 0 12px 32px rgba(0,0,0,0.3);
    }
    .app-tile-icon {
      width: 64px; height: 64px; border-radius: 16px;
      display: flex; align-items: center; justify-content: center;
      font-size: 28px;
    }
    .app-tile-label {
      font-size: 13px; font-weight: 600;
      color: rgba(255,255,255,0.85);
      line-height: 1.3;
    }
    .app-tile-desc {
      font-size: 11px; color: rgba(255,255,255,0.35);
      line-height: 1.5;
    }

    .launcher-footer {
      margin-top: 48px; display: flex; gap: 24px; align-items: center;
    }
    .launcher-footer-link {
      font-size: 12px; color: rgba(255,255,255,0.3);
      text-decoration: none; transition: color 0.15s;
    }
    .launcher-footer-link:hover { color: rgba(255,255,255,0.7); }

    /* CARDS & TABLES (existing patterns) */
    .topbar { display:flex; align-items:center; justify-content:space-between; margin-bottom:24px; }
    .topbar-title { font-size:22px; font-weight:700; color:#1C2028; }
    .topbar-actions { display:flex; gap:8px; }
    .page-content {}
    .page-title { font-size:26px; font-weight:700; color:#1C2028; margin-bottom:6px; }
    .page-subtitle { font-size:14px; color:#8B7E72; }
    .card { background:#fff; border-radius:12px; border:1px solid #E8E4DE; overflow:hidden; margin-bottom:20px; }
    .card-header { display:flex; align-items:center; justify-content:space-between; padding:16px 20px; border-bottom:1px solid #F0EDE8; }
    .card-title { font-size:14px; font-weight:700; color:#1C2028; }
    .stats-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:24px; }
    .stat-card { background:#fff; border-radius:12px; border:1px solid #E8E4DE; padding:20px; display:flex; align-items:center; gap:14px; }
    .stat-icon { font-size:32px; }
    .stat-num { font-size:28px; font-weight:800; color:#1C2028; line-height:1; }
    .stat-label { font-size:11px; color:#8B7E72; margin-top:3px; text-transform:uppercase; letter-spacing:1px; }
    .stat-trend { font-size:11px; padding:3px 8px; border-radius:20px; background:#E8EEE5; color:#7B4F7B; margin-left:auto; font-weight:600; align-self:flex-start; }
    .data-table { width:100%; border-collapse:collapse; }
    .data-table th { padding:10px 16px; text-align:left; font-size:10px; font-weight:700; letter-spacing:1.5px; text-transform:uppercase; color:#8B7E72; border-bottom:1px solid #F0EDE8; white-space:nowrap; }
    .data-table td { padding:12px 16px; font-size:13px; color:#3A3228; border-bottom:1px solid #F8F5F0; vertical-align:middle; }
    .data-table tr:last-child td { border-bottom:none; }
    .data-table tr:hover td { background:#FAFAF8; }
    .td-img { width:44px; height:44px; object-fit:cover; border-radius:8px; border:1px solid #E8E4DE; }
    .td-name { font-weight:600; color:#1C2028; margin-bottom:2px; }
    .td-sub { font-size:11px; color:#8B7E72; }
    .td-price { font-weight:700; color:#1C2028; font-size:14px; }
    .td-actions { display:flex; gap:4px; }
    .badge { display:inline-flex; align-items:center; gap:3px; padding:3px 8px; border-radius:20px; font-size:10px; font-weight:700; letter-spacing:0.5px; white-space:nowrap; }
    .badge-active    { background:#E8F5E9; color:#2E7D32; }
    .badge-inactive  { background:#F5F5F5; color:#757575; }
    .badge-bestseller{ background:#FFF8E1; color:#F57F17; }
    .badge-new       { background:#E3F2FD; color:#1565C0; }
    .btn { display:inline-flex; align-items:center; gap:6px; padding:8px 16px; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; text-decoration:none; border:none; transition:all 0.15s; }
    .btn-sm { padding:6px 12px; font-size:12px; }
    .btn-primary { background:#7B4F7B; color:#fff; }
    .btn-primary:hover { background:#2D3D28; }
    .btn-ghost { background:transparent; color:#5A5248; border:1px solid #E8E4DE; }
    .btn-ghost:hover { background:#F0EDE8; }
    .btn-danger { background:#FFEBEE; color:#C62828; }
    .btn-danger:hover { background:#FFCDD2; }
    .btn-icon { padding:6px 8px; }
    .form-group { margin-bottom:18px; }
    .form-label { display:block; font-size:12px; font-weight:700; color:#5A5248; margin-bottom:6px; letter-spacing:0.5px; text-transform:uppercase; }
    .form-control { width:100%; padding:10px 14px; border:1.5px solid #E8E4DE; border-radius:8px; font-size:14px; color:#1C2028; background:#fff; outline:none; transition:border-color 0.15s; }
    .form-control:focus { border-color:#7B4F7B; }
    select.form-control { appearance:none; background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%238B7E72' d='M6 8L1 3h10z'/%3E%3C/svg%3E"); background-repeat:no-repeat; background-position:right 12px center; padding-right:36px; }
    .form-two { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
    .toast-bar { position:fixed; bottom:24px; right:24px; background:#1C2028; color:#fff; padding:12px 20px; border-radius:10px; font-size:13px; font-weight:600; z-index:9999; box-shadow:0 4px 20px rgba(0,0,0,0.25); animation:slideUp 0.25s ease; }
    @keyframes slideUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
    input[type="checkbox"] { width:16px; height:16px; accent-color:#7B4F7B; cursor:pointer; }
    img { max-width:100%; }
    .empty-box { text-align:center; padding:60px 20px; color:#8B7E72; }
    .empty-box p { font-size:16px; font-style:italic; margin-top:12px; }

    /* HAMBURGER */
    .nav-ham {
      display: none; align-items: center; justify-content: center;
      width: 48px; height: 52px; background: none; border: none;
      color: rgba(255,255,255,0.7); font-size: 20px; cursor: pointer;
      border-right: 1px solid rgba(255,255,255,0.07); flex-shrink: 0;
      transition: background 0.15s;
    }
    .nav-ham:hover { background: rgba(255,255,255,0.08); color: #fff; }

    /* OVERLAY */
    .sidebar-overlay {
      position: fixed; inset: 0; z-index: 99;
      background: rgba(0,0,0,0.45); backdrop-filter: blur(2px);
    }

    @media(max-width: 900px) {
      .nav-ham { display: flex; }
      .launcher-grid { grid-template-columns:repeat(2,1fr); }
      .stats-grid { grid-template-columns:1fr 1fr; }
      .form-two { grid-template-columns:1fr; }
      .module-sidebar {
        transform: translateX(-100%);
        transition: transform 0.25s cubic-bezier(.4,0,.2,1);
        box-shadow: none;
      }
      .module-sidebar.open {
        transform: translateX(0);
        box-shadow: 4px 0 24px rgba(0,0,0,0.18);
      }
      .admin-main { margin-left:0 !important; padding:16px; }
      .topbar { padding: 0 16px; flex-wrap: wrap; gap: 8px; height: auto; min-height: 52px; padding-top: 8px; padding-bottom: 8px; }
    }
    @media(max-width: 500px) {
      .launcher-grid { grid-template-columns:1fr 1fr; gap:10px; }
      .launcher { padding:40px 16px; }
      .launcher-title { font-size:28px; }
      .app-tile { padding:20px 12px; }
      .app-tile-icon { width:48px; height:48px; font-size:22px; }
      .topnav-brand { min-width:unset; }
      .topnav-brand-text { display:none; }
      .topnav-user-name { display:none; }
      .topnav-link { display:none; }
      .admin-main { padding: 12px; }
    }
  `;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />

      {/* TOP NAVIGATION BAR */}
      <nav className="topnav">
        <Link href="/admin" className="topnav-brand">
          <div className="topnav-brand-icon">🇸🇪🇬🇧</div>
          <div className="topnav-brand-text">
            <span className="topnav-brand-main">{siteName}</span>
            <span className="topnav-brand-sub">Admin</span>
          </div>
        </Link>

        {!isHome && currentApp && (
          <button className="nav-ham" onClick={() => setMob(o => !o)} title="Menu" aria-label="Menu">
            {mobOpen ? '✕' : '☰'}
          </button>
        )}

        <Link href="/admin" className={`topnav-home ${isHome ? 'active' : ''}`} title="Accueil">
          ⊞
        </Link>

        {currentApp && (
          <div className="topnav-app">
            <span className="topnav-app-dot" style={{ background: currentApp.color }}></span>
            {currentApp.icon} {currentApp.label}
          </div>
        )}

        <div className="topnav-spacer" />

        <a href="https://swedishcravings.fr" target="_blank" rel="noopener" className="topnav-link" title="Voir le site">
          🌐 <span>Voir le site</span>
        </a>
        <a href="https://supabase.com/dashboard" target="_blank" rel="noopener" className="topnav-link" title="Supabase">
          🗄️
        </a>

        <div className="topnav-user">
          <div className="topnav-avatar" style={{ background: appColor }}>{initials}</div>
          <span className="topnav-user-name">{email.split('@')[0]}</span>
          <button className="topnav-logout" onClick={logout} title="Déconnexion">⏻</button>
        </div>
      </nav>

      <div className="admin-shell">
        {/* OVERLAY mobile */}
        {mobOpen && <div className="sidebar-overlay" onClick={() => setMob(false)} />}

        {/* MODULE SIDEBAR — visible uniquement hors home */}
        {!isHome && currentApp && (
          <aside className={`module-sidebar${mobOpen ? ' open' : ''}`}>
            <div className="module-sidebar-header" style={{ color: currentApp.color }}>
              {currentApp.icon} {currentApp.label}
            </div>
            <nav className="module-nav">
              {currentApp.nav.map((item, i) => {
                const isActive = pathname.startsWith(item.href.split('?')[0]);
                return (
                  <Link key={i} href={item.href} className={`module-nav-link ${isActive ? 'active' : ''}`}
                    style={isActive ? { color: currentApp.color, borderLeftColor: currentApp.color } : {}}>
                    <span className="module-nav-icon">{item.icon}</span>
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </aside>
        )}

        <main className="admin-main" style={{
          marginLeft: !isHome && currentApp ? '200px' : '0',
          padding: isHome ? '0' : '28px',
        }}>
          {children}
        </main>
      </div>
    </>
  );
}
