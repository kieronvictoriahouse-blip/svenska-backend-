'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { MODULES } from '@/lib/admin-nav';

type Stats = {
  products: number; orders: number; contacts: number;
  pending_orders: number; low_stock: number; revenue_month: number; abandoned: number;
};

const QUICK = [
  { href: '/admin/produits/nouveau', icon: '➕', label: 'Nouveau produit' },
  { href: '/admin/commandes',        icon: '🛒', label: 'Commandes' },
  { href: '/admin/home-cms',         icon: '✏️', label: 'Modifier la home' },
  { href: '/admin/medias',           icon: '📸', label: 'Photos' },
];

export default function AdminHome() {
  const [stats, setStats] = useState<Stats>({
    products: 0, orders: 0, contacts: 0, pending_orders: 0, low_stock: 0, revenue_month: 0, abandoned: 0,
  });
  const [siteName, setSiteName] = useState('');
  const [greeting, setGreeting] = useState('Bonjour');

  useEffect(() => {
    const h = new Date().getHours();
    setGreeting(h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir');
    loadStats();
  }, []);

  async function loadStats() {
    try {
      const [p, o, c, s, ab, wl] = await Promise.all([
        fetch('/api/products?limit=500').then(r => r.json()).catch(() => ({})),
        fetch('/api/orders').then(r => r.json()).catch(() => ({})),
        fetch('/api/contacts').then(r => r.json()).catch(() => ({})),
        fetch('/api/stock').then(r => r.json()).catch(() => ({})),
        fetch('/api/marketing?tab=abandoned').then(r => r.json()).catch(() => ({})),
        fetch('/api/white-label').then(r => r.ok ? r.json() : null).catch(() => null),
      ]);
      const orders = o.orders || [];
      const now = new Date();
      const monthRevenue = orders
        .filter((x: any) => x.status !== 'cancelled' && new Date(x.created_at).getMonth() === now.getMonth() && new Date(x.created_at).getFullYear() === now.getFullYear())
        .reduce((sum: number, x: any) => sum + (x.total || 0), 0);
      setStats({
        products: (p.products || []).length,
        orders: orders.length,
        contacts: (c.contacts || []).length,
        pending_orders: orders.filter((x: any) => x.status === 'pending').length,
        low_stock: (s.products || []).filter((x: any) => x.track_stock && x.stock <= x.stock_alert).length,
        revenue_month: monthRevenue,
        abandoned: (ab.carts || []).filter((x: any) => !x.recovered).length,
      });
      if (wl?.config?.site_name) setSiteName(wl.config.site_name);
    } catch (e) {}
  }

  const email = typeof window !== 'undefined' ? (localStorage.getItem('sd_admin_email') || '') : '';
  const firstName = email.split('@')[0] || 'Admin';
  const fmt = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

  const ALERTS = [
    stats.pending_orders > 0 && { label: `${stats.pending_orders} commande(s) en attente`, color: '#F59E0B', href: '/admin/commandes' },
    stats.low_stock > 0 && { label: `${stats.low_stock} produit(s) en stock faible`, color: '#EF4444', href: '/admin/stock' },
    stats.abandoned > 0 && { label: `${stats.abandoned} panier(s) abandonné(s)`, color: '#8B5CF6', href: '/admin/marketing?tab=cart' },
  ].filter(Boolean) as { label: string; color: string; href: string }[];

  const css = `
    .hub { padding: 28px; max-width: 1120px; margin: 0 auto; }
    .hub-header { margin-bottom: 22px; }
    .hub-title { font-family: 'Cormorant Garamond', serif; font-size: 34px; font-weight: 600; color: #1C2028; line-height: 1.1; }
    .hub-title em { font-style: italic; color: #7B4F7B; }
    .hub-sub { font-size: 13px; color: #8B7E72; margin-top: 4px; }
    .hub-quick { display: flex; gap: 8px; flex-wrap: wrap; margin: 16px 0 24px; }
    .hub-quick a { display: inline-flex; align-items: center; gap: 7px; background: #1C2028; color: #fff;
      border-radius: 24px; padding: 8px 16px; font-size: 12.5px; font-weight: 600; text-decoration: none; transition: opacity .15s; }
    .hub-quick a:hover { opacity: .85; }
    .kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 20px; }
    .kpi { background: #fff; border: 1px solid #E8E4DE; border-radius: 12px; padding: 16px 20px; }
    .kpi-num { font-size: 26px; font-weight: 800; color: #1C2028; line-height: 1; }
    .kpi-label { font-size: 11px; color: #8B7E72; margin-top: 5px; text-transform: uppercase; letter-spacing: .5px; }
    .alerts { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 26px; }
    .alert { display: inline-flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 20px;
      font-size: 12px; font-weight: 600; cursor: pointer; border: 1px solid transparent; text-decoration: none; }
    .hub-section { margin-top: 22px; }
    .hub-section-title { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 700;
      letter-spacing: 1.5px; text-transform: uppercase; color: #8B7E72; margin-bottom: 12px; }
    .hub-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 12px; }
    .hub-card { background: #fff; border: 1px solid #E8E4DE; border-radius: 12px; padding: 16px 18px;
      text-decoration: none; display: flex; align-items: center; gap: 13px; transition: transform .15s, box-shadow .15s, border-color .15s; }
    .hub-card:hover { transform: translateY(-3px); box-shadow: 0 10px 26px rgba(0,0,0,0.10); border-color: transparent; }
    .hub-card-icon { width: 42px; height: 42px; border-radius: 10px; display: flex; align-items: center; justify-content: center;
      font-size: 21px; flex-shrink: 0; }
    .hub-card-label { font-size: 14px; font-weight: 700; color: #1C2028; }
    .hub-card-desc { font-size: 11px; color: #8B7E72; margin-top: 2px; line-height: 1.4; }
    @media(max-width: 900px) { .kpi-row { grid-template-columns: 1fr 1fr; } .hub { padding: 18px; } }
    @media(max-width: 500px) { .hub-grid { grid-template-columns: 1fr 1fr; } }
  `;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="hub">
        <div className="hub-header">
          <div className="hub-title">{greeting}, <em>{firstName}</em></div>
          <div className="hub-sub">{siteName ? `${siteName} · ` : ''}Back-office · {stats.products} produits · {stats.contacts} contacts</div>
        </div>

        <div className="hub-quick">
          {QUICK.map(q => (
            <Link key={q.href} href={q.href}><span>{q.icon}</span> {q.label}</Link>
          ))}
        </div>

        <div className="kpi-row">
          <div className="kpi"><div className="kpi-num">{fmt(stats.revenue_month)}</div><div className="kpi-label">CA ce mois</div></div>
          <div className="kpi"><div className="kpi-num">{stats.orders}</div><div className="kpi-label">Commandes</div></div>
          <div className="kpi"><div className="kpi-num">{stats.contacts}</div><div className="kpi-label">Contacts</div></div>
          <div className="kpi"><div className="kpi-num">{stats.products}</div><div className="kpi-label">Produits</div></div>
        </div>

        {ALERTS.length > 0 && (
          <div className="alerts">
            {ALERTS.map((a, i) => (
              <Link key={i} href={a.href} className="alert" style={{ background: a.color + '15', color: a.color, borderColor: a.color + '30' }}>
                ⚠️ {a.label}
              </Link>
            ))}
          </div>
        )}

        {MODULES.map(mod => (
          <div key={mod.key} className="hub-section">
            <div className="hub-section-title" style={{ color: mod.color }}>
              <span>{mod.icon}</span> {mod.label}
            </div>
            <div className="hub-grid">
              {mod.nav.map(item => (
                <Link key={item.href} href={item.href} className="hub-card">
                  <div className="hub-card-icon" style={{ background: mod.color + '18' }}>{item.icon}</div>
                  <div>
                    <div className="hub-card-label">{item.label}</div>
                    {item.desc && <div className="hub-card-desc">{item.desc}</div>}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
