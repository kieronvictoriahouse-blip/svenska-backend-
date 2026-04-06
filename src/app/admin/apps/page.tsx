'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const APPS = [
  {
    section: '🛍️ Boutique',
    items: [
      { href: '/admin/produits',    emoji: '📦', label: 'Produits',      desc: 'Gérer le catalogue',         color: '#3E5238' },
      { href: '/admin/categories',  emoji: '🗂️', label: 'Catégories',   desc: 'Organiser les rayons',        color: '#587050' },
      { href: '/admin/stock',       emoji: '🔢', label: 'Stock',         desc: 'Niveaux & alertes',           color: '#7A9468' },
      { href: '/admin/commandes',   emoji: '🛒', label: 'Commandes',     desc: 'Suivi des ventes',            color: '#9E5A3C' },
    ]
  },
  {
    section: '👥 Contacts',
    items: [
      { href: '/admin/contacts?type=client',   emoji: '👤', label: 'Clients',      desc: 'Carnet d\'adresses clients', color: '#2563EB' },
      { href: '/admin/contacts?type=supplier', emoji: '🏭', label: 'Fournisseurs', desc: 'Gestion fournisseurs',       color: '#7C3AED' },
      { href: '/admin/contacts',               emoji: '📇', label: 'Tous contacts',desc: 'Vue globale CRM',            color: '#0891B2' },
    ]
  },
  {
    section: '📦 Achats',
    items: [
      { href: '/admin/achats',      emoji: '🛍️', label: 'Commandes achat', desc: 'Passer des commandes',    color: '#D97706' },
      { href: '/admin/receptions',  emoji: '📬', label: 'Réceptions',       desc: 'Recevoir & stocker',      color: '#F59E0B' },
      { href: '/admin/gestion',     emoji: '🧾', label: 'Factures achat',   desc: 'Factures fournisseurs',   color: '#EF4444' },
    ]
  },
  {
    section: '💰 Finance',
    items: [
      { href: '/admin/gestion',           emoji: '📄', label: 'Factures vente', desc: 'Facturer les clients',    color: '#10B981' },
      { href: '/admin/gestion#marges',    emoji: '📈', label: 'Marges',          desc: 'Rentabilité produits',   color: '#059669' },
      { href: '/admin/gestion#transport', emoji: '🚚', label: 'Transport',        desc: 'Répartition des coûts', color: '#047857' },
    ]
  },
  {
    section: '📣 Marketing',
    items: [
      { href: '/admin/marketing',         emoji: '📧', label: 'Campagnes',       desc: 'Email & pub',            color: '#DC2626' },
      { href: '/admin/marketing?tab=promo',emoji: '🎟️', label: 'Codes promo',   desc: 'Réductions & offres',    color: '#B91C1C' },
      { href: '/admin/marketing?tab=cart', emoji: '🛒', label: 'Abandon panier', desc: 'Relances automatiques',  color: '#991B1B' },
    ]
  },
  {
    section: '🌐 Contenu',
    items: [
      { href: '/admin/home-cms',    emoji: '🏠', label: 'Page d\'accueil', desc: 'Éditer la home',             color: '#4F46E5' },
      { href: '/admin/medias',      emoji: '🖼️', label: 'Médiathèque',    desc: 'Photos & fichiers',           color: '#6D28D9' },
      { href: '/admin/pages',       emoji: '📝', label: 'Pages',           desc: 'CGV, mentions légales…',      color: '#7C3AED' },
    ]
  },
  {
    section: '⚙️ Configuration',
    items: [
      { href: '/admin/white-label', emoji: '🎨', label: 'White Label',    desc: 'Couleurs, fonts, logo',       color: '#0F172A' },
      { href: '/admin/white-label?tab=import', emoji: '📥', label: 'Import données', desc: 'CSV articles/clients', color: '#1E293B' },
    ]
  },
];

type Stats = {
  products: number; orders: number; contacts: number;
  pending_orders: number; low_stock: number; campaigns: number;
  revenue_month: number; abandoned: number;
};

export default function AppsPage() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats>({
    products: 0, orders: 0, contacts: 0, pending_orders: 0,
    low_stock: 0, campaigns: 0, revenue_month: 0, abandoned: 0
  });

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    try {
      const [p, o, c, s, m, ab] = await Promise.all([
        fetch('/api/products').then(r => r.json()),
        fetch('/api/orders').then(r => r.json()),
        fetch('/api/contacts').then(r => r.json()),
        fetch('/api/stock').then(r => r.json()),
        fetch('/api/marketing').then(r => r.json()),
        fetch('/api/marketing?tab=abandoned').then(r => r.json()),
      ]);
      const now = new Date();
      const monthRevenue = (o.orders || [])
        .filter((x: any) => x.status !== 'cancelled' && new Date(x.created_at).getMonth() === now.getMonth())
        .reduce((s: number, x: any) => s + x.total, 0);
      setStats({
        products: (p.products || []).length,
        orders: (o.orders || []).length,
        contacts: (c.contacts || []).length,
        pending_orders: (o.orders || []).filter((x: any) => x.status === 'pending').length,
        low_stock: (s.products || []).filter((x: any) => x.track_stock && x.stock <= x.stock_alert).length,
        campaigns: (m.campaigns || []).length,
        revenue_month: monthRevenue,
        abandoned: (ab.carts || []).filter((x: any) => !x.recovered).length,
      });
    } catch(e) {}
  }

  const ALERTS = [
    stats.pending_orders > 0 && { label: `${stats.pending_orders} commande(s) en attente`, color: '#F59E0B', href: '/admin/commandes' },
    stats.low_stock > 0 && { label: `${stats.low_stock} produit(s) en stock faible`, color: '#EF4444', href: '/admin/stock' },
    stats.abandoned > 0 && { label: `${stats.abandoned} panier(s) abandonné(s)`, color: '#8B5CF6', href: '/admin/marketing?tab=cart' },
  ].filter(Boolean) as { label: string; color: string; href: string }[];

  const fmt = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' €';

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600&family=Jost:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Jost', sans-serif; background: #EDEAE4; }
    .apps-wrap { padding: 28px; }
    .apps-header { margin-bottom: 28px; }
    .apps-title { font-family: 'Cormorant Garamond', serif; font-size: 36px; font-weight: 600; color: #1C2028; }
    .apps-sub { font-size: 14px; color: #6A7280; margin-top: 4px; }
    .kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 24px; }
    .kpi { background: #fff; border: 1px solid #D8CEBC; border-radius: 8px; padding: 16px 20px; }
    .kpi-num { font-family: 'DM Mono', monospace; font-size: 26px; font-weight: 500; color: #1C2028; }
    .kpi-label { font-size: 11px; color: #6A7280; margin-top: 3px; text-transform: uppercase; letter-spacing: 0.5px; }
    .alerts { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 24px; }
    .alert { display: flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 20px; font-size: 12px; font-weight: 500; cursor: pointer; border: none; }
    .section-title { font-size: 11px; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; color: #6A7280; margin-bottom: 12px; margin-top: 24px; }
    .apps-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; margin-bottom: 8px; }
    .app-card { background: #fff; border: 1px solid #D8CEBC; border-radius: 10px; padding: 20px 16px; cursor: pointer; transition: all 0.15s; text-align: center; text-decoration: none; display: block; }
    .app-card:hover { transform: translateY(-3px); box-shadow: 0 8px 24px rgba(0,0,0,0.1); border-color: transparent; }
    .app-emoji { font-size: 36px; display: block; margin-bottom: 10px; }
    .app-label { font-size: 13px; font-weight: 600; color: #1C2028; margin-bottom: 4px; }
    .app-desc { font-size: 11px; color: #6A7280; line-height: 1.4; }
    .app-dot { width: 8px; height: 8px; border-radius: 50%; margin: 8px auto 0; }
  `;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="apps-wrap">
        <div className="apps-header">
          <div className="apps-title">Svenska Delikatessen</div>
          <div className="apps-sub">ERP · Back-office complet</div>
        </div>

        {/* KPIs */}
        <div className="kpi-row">
          <div className="kpi"><div className="kpi-num">{fmt(stats.revenue_month)}</div><div className="kpi-label">CA ce mois</div></div>
          <div className="kpi"><div className="kpi-num">{stats.orders}</div><div className="kpi-label">Commandes total</div></div>
          <div className="kpi"><div className="kpi-num">{stats.contacts}</div><div className="kpi-label">Contacts</div></div>
          <div className="kpi"><div className="kpi-num">{stats.products}</div><div className="kpi-label">Produits actifs</div></div>
        </div>

        {/* Alertes */}
        {ALERTS.length > 0 && (
          <div className="alerts">
            {ALERTS.map((a, i) => (
              <button key={i} className="alert" style={{ background: a.color + '15', color: a.color, border: `1px solid ${a.color}30` }}
                onClick={() => router.push(a.href)}>
                ⚠️ {a.label}
              </button>
            ))}
          </div>
        )}

        {/* Apps par section */}
        {APPS.map((section, si) => (
          <div key={si}>
            <div className="section-title">{section.section}</div>
            <div className="apps-grid">
              {section.items.map((app, ai) => (
                <a key={ai} href={app.href} className="app-card">
                  <span className="app-emoji">{app.emoji}</span>
                  <div className="app-label">{app.label}</div>
                  <div className="app-desc">{app.desc}</div>
                  <div className="app-dot" style={{ background: app.color }} />
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
