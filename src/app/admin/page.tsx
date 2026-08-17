'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { adminFetch } from '@/lib/auth-client';
import { T, BADGE, ORDER_STATUS, thumbStyle, initials, eur, num, stockColor } from '@/lib/admin-theme';
import { useT } from '@/lib/admin-i18n';
import { TDB } from './i18n';

/* ═══════════════════════════════════════════════════════════════
   ÉCRAN 1 — TABLEAU DE BORD
   Handoff « Redesign du back office », section « 1. Tableau de bord ».
   Toutes les données proviennent de Supabase ; aucune valeur figée.
   ═══════════════════════════════════════════════════════════════ */

type Order = {
  id: string; order_number: string; status: string; total: number;
  customer_name?: string; created_at: string; is_test?: boolean;
  lines?: any; refunded_amount?: number; refunds?: any[];
};
type Product = {
  id: string; name_fr: string; price: number; cost_price?: number;
  stock?: number; track_stock?: boolean; low_stock_threshold?: number;
  image_url?: string; sort_order?: number;
};

const PAID = ['paid', 'confirmed', 'shipped', 'delivered'];
const r2 = (n: number) => Math.round((n || 0) * 100) / 100;

/** Remboursements non répercutés dans les montants de la commande.
 *  Même règle que la page Commandes — cf. flag `order_modified`. */
function pendingRefund(o: Order): number {
  const hist = Array.isArray(o.refunds) ? o.refunds : [];
  if (!hist.length) return r2(Number(o.refunded_amount) || 0);
  return r2(hist.filter((r: any) => !r.order_modified).reduce((s: number, r: any) => s + (Number(r.amount) || 0), 0));
}

export default function AdminHome() {
  const { t, tc, lang } = useT(TDB);
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [contacts, setContacts] = useState<number>(0);
  const [firstName, setFirstName] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncedAt] = useState(() => new Date());

  useEffect(() => {
    const mail = localStorage.getItem('sd_admin_email') || '';
    setFirstName(mail.split('@')[0].split(/[._-]/)[0].replace(/^\w/, c => c.toUpperCase()) || 'toi');
    (async () => {
      try {
        const [o, p, c] = await Promise.all([
          adminFetch('/api/orders').then(r => r.json()).catch(() => ({})),
          adminFetch('/api/products?limit=1000').then(r => r.json()).catch(() => ({})),
          adminFetch('/api/contacts').then(r => r.json()).catch(() => ({})),
        ]);
        setOrders(o.orders || []);
        setProducts(p.products || []);
        setContacts((c.contacts || []).length);
      } finally { setLoading(false); }
    })();
  }, []);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir';

  /* ── Agrégats ──────────────────────────────────────────── */
  const real = orders.filter(o => !o.is_test);
  const paidOrders = real.filter(o => PAID.includes(o.status));

  const now = new Date();
  const inMonth = (d: string, delta = 0) => {
    const x = new Date(d);
    const ref = new Date(now.getFullYear(), now.getMonth() - delta, 1);
    return x.getMonth() === ref.getMonth() && x.getFullYear() === ref.getFullYear();
  };
  const netOf = (o: Order) => r2((Number(o.total) || 0) - pendingRefund(o));

  const caMonth = r2(paidOrders.filter(o => inMonth(o.created_at)).reduce((s, o) => s + netOf(o), 0));
  const caPrev  = r2(paidOrders.filter(o => inMonth(o.created_at, 1)).reduce((s, o) => s + netOf(o), 0));
  const ordersMonth = paidOrders.filter(o => inMonth(o.created_at)).length;
  const ordersPrev  = paidOrders.filter(o => inMonth(o.created_at, 1)).length;
  const avgCart = paidOrders.length ? r2(paidOrders.reduce((s, o) => s + netOf(o), 0) / paidOrders.length) : 0;
  const avgPrev = ordersPrev ? r2(paidOrders.filter(o => inMonth(o.created_at, 1)).reduce((s, o) => s + netOf(o), 0) / ordersPrev) : 0;

  const pct = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);

  /** Sparkline : CA net par jour sur les 12 derniers jours, normalisé 0-100. */
  const spark = (pick: (o: Order) => number) => {
    const days: number[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days.push(paidOrders.filter(o => String(o.created_at).slice(0, 10) === key).reduce((s, o) => s + pick(o), 0));
    }
    const max = Math.max(...days, 1);
    return days.map(v => Math.round((v / max) * 100));
  };
  const sparkCA = spark(netOf);
  const sparkCount = spark(() => 1);

  const KPIS = [
    { label: 'CA ce mois',   value: eur(caMonth),  delta: pct(caMonth, caPrev),       bars: sparkCA },
    { label: 'Commandes',    value: num(ordersMonth), delta: ordersMonth - ordersPrev, bars: sparkCount, raw: true },
    { label: 'Panier moyen', value: eur(avgCart),  delta: pct(avgCart, avgPrev),      bars: sparkCA },
    { label: 'Contacts',     value: num(contacts), delta: null,                        bars: sparkCount },
  ];

  /* ── Stock ─────────────────────────────────────────────── */
  const tracked = products.filter(p => p.track_stock === true && typeof p.stock === 'number');
  const threshOf = (p: Product) => Number(p.low_stock_threshold) || 12;
  const outOfStock = tracked.filter(p => (p.stock || 0) <= 0);
  const lowStock = tracked.filter(p => (p.stock || 0) > 0 && (p.stock || 0) <= threshOf(p));
  const toRestock = [...outOfStock, ...lowStock].slice(0, 5);
  const toProcess = real.filter(o => ['paid', 'confirmed'].includes(o.status)).length;

  /* ── Top ventes 30 j ───────────────────────────────────── */
  const since = new Date(now); since.setDate(since.getDate() - 30);
  const sales: Record<string, { name: string; qty: number }> = {};
  for (const o of paidOrders) {
    if (new Date(o.created_at) < since) continue;
    let lines: any[] = [];
    try { lines = typeof o.lines === 'string' ? JSON.parse(o.lines) : (o.lines || []); } catch { lines = []; }
    for (const l of lines) {
      const key = l.product_id || l.name || 'x';
      const name = l.name_fr || l.name || l.desc || 'Article';
      sales[key] = sales[key] || { name, qty: 0 };
      sales[key].qty += Number(l.qty) || 1;
    }
  }
  const top = Object.values(sales).sort((a, b) => b.qty - a.qty).slice(0, 5);
  const topMax = Math.max(...top.map(t => t.qty), 1);

  const recent = [...real]
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
    .slice(0, 6);

  const dateLabel = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const syncMin = Math.max(0, Math.round((Date.now() - +syncedAt) / 60000));

  const alerts = [
    toProcess > 0 && { tone: BADGE.amber,  icon: 'pending_actions', text: `${toProcess} commande${toProcess > 1 ? 's' : ''} à traiter`, href: '/admin/commandes' },
    lowStock.length > 0 && { tone: BADGE.orange, icon: 'warning', text: `${lowStock.length} produit${lowStock.length > 1 ? 's' : ''} sous le seuil`, href: '/admin/stock' },
    outOfStock.length > 0 && { tone: BADGE.red, icon: 'error', text: `${outOfStock.length} rupture${outOfStock.length > 1 ? 's' : ''}${outOfStock[0] ? ' · ' + outOfStock[0].name_fr : ''}`, href: '/admin/stock' },
  ].filter(Boolean) as Array<{ tone: { bg: string; fg: string }; icon: string; text: string; href: string }>;

  return (
    <div style={{ maxWidth: 1500, margin: '0 auto', padding: '2px 2px 40px' }}>

      {/* ── Salutation + actions ───────────────────────────── */}
      <div className="sc-head">
        <div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 31, fontWeight: 600, lineHeight: 1.05, color: T.ink }}>
            {greeting}, <em style={{ color: 'var(--accent)' }}>{firstName}</em>
          </div>
          <div style={{ fontSize: 12, color: T.text3, marginTop: 3 }}>
            {dateLabel} · {products.length} produit{products.length > 1 ? 's' : ''} · dernière synchro il y a {syncMin} min
          </div>
        </div>
        <div className="sc-actions">
          <Link href="/admin/produits/nouveau" className="sc-btn sc-btn-primary"><span className="ms">add</span>{t('nouveauProduit')}</Link>
          <Link href="/admin/home-cms" className="sc-btn sc-btn-secondary"><span className="ms">edit_note</span>{t('modifierHome')}</Link>
          <Link href="/admin/medias" className="sc-btn sc-btn-secondary"><span className="ms">photo_library</span>{t('photos')}</Link>
        </div>
      </div>

      {/* ── KPI ────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(178px,1fr))', gap: 10, marginBottom: 10 }}>
        {KPIS.map(k => {
          const up = (k.delta ?? 0) >= 0;
          return (
            <div key={k.label} className="sc-card" style={{ padding: '13px 15px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: 1.2, textTransform: 'uppercase', color: T.muted }}>{k.label}</span>
                {k.delta !== null && (
                  <span className="sc-badge" style={{ background: up ? BADGE.green.bg : BADGE.amber.bg, color: up ? BADGE.green.fg : BADGE.amber.fg }}>
                    {up ? '+' : ''}{k.raw ? k.delta : `${k.delta} %`}
                  </span>
                )}
              </div>
              <div className="sc-num" style={{ fontSize: 25, fontWeight: 700, letterSpacing: -.5, margin: '6px 0 8px', color: T.ink }}>{k.value}</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 20 }}>
                {k.bars.map((v, i) => (
                  <div key={i} style={{ flex: 1, height: `${Math.max(12, v)}%`, borderRadius: 2, background: 'var(--accent)', opacity: 0.35 + v / 160 }} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Alertes ────────────────────────────────────────── */}
      {alerts.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {alerts.map((a, i) => (
            <Link key={i} href={a.href} style={{
              display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 12px', borderRadius: 20,
              background: a.tone.bg, color: a.tone.fg, border: `1px solid ${a.tone.fg}22`,
              fontSize: 12, fontWeight: 500, textDecoration: 'none',
            }}>
              <span className="ms" style={{ fontSize: 16 }}>{a.icon}</span>
              {a.text}
              <span className="ms" style={{ fontSize: 15 }}>arrow_forward</span>
            </Link>
          ))}
        </div>
      )}

      {/* ── Deux colonnes ──────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>

        {/* Commandes récentes */}
        <div className="sc-card" style={{ flex: '2 1 460px', minWidth: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 15px', borderBottom: `1px solid ${T.border}` }}>
            <span className="sc-card-title">{t('commandesRecentes')}</span>
            <Link href="/admin/commandes" style={{ fontSize: 11.5, color: 'var(--accent)', textDecoration: 'none' }}>{t('toutVoir')}</Link>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="sc-table" style={{ minWidth: 520 }}>
              <tbody>
                {loading && <tr><td colSpan={5}><div className="sc-empty">{tc('loading')}</div></td></tr>}
                {!loading && recent.length === 0 && <tr><td colSpan={5}><div className="sc-empty">{t('aucuneCommande')}</div></td></tr>}
                {recent.map(o => {
                  const s = ORDER_STATUS[o.status] || { label: o.status, tone: 'gray' as const };
                  return (
                    <tr key={o.id} style={{ cursor: 'pointer' }} onClick={() => router.push('/admin/commandes')}>
                      <td className="sc-num" style={{ fontWeight: 600, color: T.ink }}>{o.order_number}</td>
                      <td>{o.customer_name || '—'}</td>
                      <td style={{ fontSize: 11.5, color: T.muted }}>
                        {new Date(o.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                      </td>
                      <td className="sc-num sc-right" style={{ fontWeight: 600, color: T.ink }}>{eur(netOf(o))}</td>
                      <td className="sc-right">
                        <span className="sc-badge" style={{ background: BADGE[s.tone].bg, color: BADGE[s.tone].fg }}>{s.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Colonne droite */}
        <div style={{ flex: '1 1 280px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>

          <div className="sc-card">
            <div style={{ padding: '12px 15px', borderBottom: `1px solid ${T.border}` }}>
              <span className="sc-card-title">{t('stockAReappro')}</span>
            </div>
            <div style={{ padding: '4px 0' }}>
              {toRestock.length === 0 && <div className="sc-empty" style={{ padding: '24px 12px' }}>{t('aucuneAlerte')}</div>}
              {toRestock.map(p => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 15px' }}>
                  {p.image_url
                    ? <img src={p.image_url} alt="" style={thumbStyle(p.name_fr, 26)} />
                    : <div style={thumbStyle(p.name_fr, 26)}>{initials(p.name_fr, 1)}</div>}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, color: T.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name_fr}</div>
                  </div>
                  <span className="sc-badge sc-num" style={{
                    background: (p.stock || 0) <= 0 ? BADGE.red.bg : BADGE.orange.bg,
                    color: (p.stock || 0) <= 0 ? BADGE.red.fg : BADGE.orange.fg,
                  }}>{p.stock || 0}</span>
                </div>
              ))}
            </div>
            <div style={{ borderTop: `1px solid ${T.borderFaint}`, padding: '9px 15px', background: T.surfaceAlt }}>
              <Link href="/admin/achats" style={{ fontSize: 11.5, color: 'var(--accent)', textDecoration: 'none' }}>{t('creerCommande')}</Link>
            </div>
          </div>

          <div className="sc-card">
            <div style={{ padding: '12px 15px', borderBottom: `1px solid ${T.border}` }}>
              <span className="sc-card-title">{t('topVentes')}</span>
            </div>
            <div style={{ padding: '8px 15px 12px' }}>
              {top.length === 0 && <div className="sc-empty" style={{ padding: '24px 0' }}>{t('pasDeVentes')}</div>}
              {top.map((t, i) => (
                <div key={i} style={{ marginBottom: 9 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: T.text2b, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</span>
                    <span className="sc-num" style={{ fontSize: 12, fontWeight: 600, color: T.ink }}>{t.qty}</span>
                  </div>
                  <div style={{ height: 4, borderRadius: 2, background: T.borderFaint2 }}>
                    <div style={{ height: '100%', width: `${(t.qty / topMax) * 100}%`, borderRadius: 2, background: 'var(--accent)' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
