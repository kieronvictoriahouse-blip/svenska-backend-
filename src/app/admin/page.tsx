'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

const APPS = [
  {
    href: '/admin/produits',
    icon: '🛍️',
    label: 'Boutique',
    desc: 'Produits · Stock · Commandes',
    color: '#7B4F7B',
    bg: 'linear-gradient(135deg, #7B4F7B 0%, #9E6E9E 100%)',
  },
  {
    href: '/admin/achats',
    icon: '📬',
    label: 'Achats',
    desc: 'Commandes · Réceptions',
    color: '#1A6B55',
    bg: 'linear-gradient(135deg, #1A6B55 0%, #2E9B7B 100%)',
  },
  {
    href: '/admin/gestion',
    icon: '💰',
    label: 'Finance',
    desc: 'Factures · Marges · Rapports',
    color: '#1C4E80',
    bg: 'linear-gradient(135deg, #1C4E80 0%, #2E6FAD 100%)',
  },
  {
    href: '/admin/contacts',
    icon: '👥',
    label: 'Contacts',
    desc: 'Clients · Fournisseurs',
    color: '#5B3427',
    bg: 'linear-gradient(135deg, #5B3427 0%, #8B5E3C 100%)',
  },
  {
    href: '/admin/marketing',
    icon: '📣',
    label: 'Marketing',
    desc: 'Campagnes · Codes promo',
    color: '#7B2D8B',
    bg: 'linear-gradient(135deg, #7B2D8B 0%, #A855C0 100%)',
  },
  {
    href: '/admin/home-cms',
    icon: '🖼️',
    label: 'Contenu',
    desc: 'Home CMS · Médiathèque',
    color: '#8B5E3C',
    bg: 'linear-gradient(135deg, #8B5E3C 0%, #AA4455 100%)',
  },
  {
    href: '/admin/stock',
    icon: '📦',
    label: 'Stocks',
    desc: 'Niveaux · Alertes · Mouvements',
    color: '#C67C3A',
    bg: 'linear-gradient(135deg, #C67C3A 0%, #E09A55 100%)',
  },
  {
    href: '/admin/white-label',
    icon: '⚙️',
    label: 'Configuration',
    desc: 'White Label · Import données',
    color: '#424242',
    bg: 'linear-gradient(135deg, #424242 0%, #616161 100%)',
  },
];

type Stats = {
  products: number;
  orders: number;
  categories: number;
  bestsellers: number;
};

export default function AdminHome() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [greeting, setGreeting] = useState('Bonjour');

  useEffect(() => {
    const h = new Date().getHours();
    if (h < 12) setGreeting('Bonjour');
    else if (h < 18) setGreeting('Bon après-midi');
    else setGreeting('Bonsoir');

    Promise.all([
      fetch('/api/products?limit=200').then(r => r.json()).catch(() => ({})),
      fetch('/api/categories').then(r => r.json()).catch(() => ({})),
    ]).then(([p, c]) => {
      const ps = p.products || [];
      setStats({
        products: ps.length,
        orders: 0,
        categories: (c.categories || []).length,
        bestsellers: ps.filter((x: any) => x.is_bestseller).length,
      });
    });
  }, []);

  const email = typeof window !== 'undefined' ? (localStorage.getItem('sd_admin_email') || '') : '';
  const firstName = email.split('@')[0] || 'Admin';

  const QUICK = [
    { href: '/admin/produits/nouveau', icon: '➕', label: 'Nouveau produit' },
    { href: '/admin/commandes',        icon: '🛒', label: 'Commandes' },
    { href: '/admin/home-cms',         icon: '✏️', label: 'Modifier la home' },
    { href: '/admin/medias',           icon: '📸', label: 'Uploader photos' },
  ];

  return (
    <div className="launcher">
      {/* Welcome */}
      <div className="launcher-welcome">
        <div className="launcher-flag">🇸🇪🇬🇧</div>
        <h1 className="launcher-title">
          {greeting}, <em>{firstName}</em>
        </h1>
        <p className="launcher-sub">
          Heather & Lingon · Admin &nbsp;·&nbsp;
          {stats ? `${stats.products} produits · ${stats.categories} catégories` : '···'}
        </p>
      </div>

      {/* Quick actions */}
      <div style={{
        display: 'flex', gap: 10, marginBottom: 48, flexWrap: 'wrap', justifyContent: 'center',
      }}>
        {QUICK.map(q => (
          <Link key={q.href} href={q.href} style={{
            display: 'flex', alignItems: 'center', gap: 7,
            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 24, padding: '8px 18px',
            fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.8)',
            textDecoration: 'none', transition: 'all 0.15s',
          }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)'; e.currentTarget.style.color = '#fff'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.8)'; }}
          >
            <span>{q.icon}</span> {q.label}
          </Link>
        ))}
      </div>

      {/* App Grid */}
      <div className="launcher-grid">
        {APPS.map(app => (
          <Link key={app.href} href={app.href} className="app-tile">
            <div className="app-tile-icon" style={{ background: app.bg }}>
              {app.icon}
            </div>
            <div>
              <div className="app-tile-label">{app.label}</div>
              <div className="app-tile-desc">{app.desc}</div>
            </div>
          </Link>
        ))}
      </div>

      {/* Footer links */}
      <div className="launcher-footer">
        <a href="https://heather-lingon.vercel.app" target="_blank" rel="noopener" className="launcher-footer-link">
          🌐 Voir le site
        </a>
        <span style={{ color: 'rgba(255,255,255,0.1)' }}>·</span>
        <a href="https://supabase.com/dashboard" target="_blank" rel="noopener" className="launcher-footer-link">
          🗄️ Supabase
        </a>
        <span style={{ color: 'rgba(255,255,255,0.1)' }}>·</span>
        <a href="https://vercel.com/dashboard" target="_blank" rel="noopener" className="launcher-footer-link">
          ▲ Vercel
        </a>
        <span style={{ color: 'rgba(255,255,255,0.1)' }}>·</span>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.15)' }}>
          Heather & Lingon © 2026
        </span>
      </div>
    </div>
  );
}
