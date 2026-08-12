'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { adminFetch } from '@/lib/auth-client';
import { T, BADGE, thumbStyle, initials, eur, num, stockColor } from '@/lib/admin-theme';

/* ═══════════════════════════════════════════════════════════════
   ÉCRAN 5 — STOCKS
   Handoff §5 : 4 cartes de synthèse teintées, table triée par urgence
   (qté/max croissant), ajustement direct dans la liste avec
   enregistrement automatique (optimiste + debounce).
   ═══════════════════════════════════════════════════════════════ */

type Product = {
  id: string; name_fr: string; image_url?: string; category_id?: string;
  price: number; cost_price?: number;
  stock?: number; stock_alert?: number; track_stock?: boolean; sort_order?: number;
};
type Category = { id: string; name_fr: string };

const LOW = 12;
const refOf = (p: Product) =>
  p.sort_order ? `SC-${String(p.sort_order).padStart(4, '0')}` : p.id.slice(0, 6).toUpperCase();

export default function StockPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const timers = useRef<Record<string, any>>({});

  useEffect(() => { load(); return () => Object.values(timers.current).forEach(clearTimeout); }, []);

  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2500); };

  async function load() {
    setLoading(true);
    try {
      const [p, c] = await Promise.all([
        adminFetch('/api/products?limit=1000').then(r => r.json()).catch(() => ({})),
        fetch('/api/categories').then(r => r.json()).catch(() => ({})),
      ]);
      setProducts(p.products || []);
      setCategories(c.categories || []);
    } finally { setLoading(false); }
  }

  const catName = (id?: string) => categories.find(c => c.id === id)?.name_fr || '—';

  /** Ajustement immédiat côté écran, écriture différée de 700 ms.
   *  Borné à 0 minimum, comme spécifié. */
  function adjust(p: Product, delta: number) {
    const next = Math.max(0, (p.stock ?? 0) + delta);
    setProducts(ps => ps.map(x => x.id === p.id ? { ...x, stock: next } : x));
    setSaving(s => new Set(s).add(p.id));

    clearTimeout(timers.current[p.id]);
    timers.current[p.id] = setTimeout(async () => {
      try {
        const res = await adminFetch(`/api/products/${p.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stock: next }),
        });
        if (!res.ok) throw new Error();
      } catch {
        // Échec d'écriture : on remet la valeur d'origine plutôt que de
        // laisser l'écran mentir sur l'état réel du stock.
        setProducts(ps => ps.map(x => x.id === p.id ? { ...x, stock: p.stock } : x));
        say(`Enregistrement impossible pour ${p.name_fr}`);
      } finally {
        setSaving(s => { const n = new Set(s); n.delete(p.id); return n; });
      }
    }, 700);
  }

  const tracked = useMemo(() => products.filter(p => p.track_stock === true), [products]);

  const out = tracked.filter(p => (p.stock ?? 0) <= 0);
  const low = tracked.filter(p => (p.stock ?? 0) > 0 && (p.stock ?? 0) <= (p.stock_alert ?? LOW));
  const healthy = tracked.filter(p => (p.stock ?? 0) > (p.stock_alert ?? LOW));
  const stockValue = tracked.reduce((s, p) => s + (Number(p.cost_price) || 0) * (p.stock ?? 0), 0);

  /* Tri par urgence : qté / seuil croissant (handoff) */
  const sorted = useMemo(() => [...tracked].sort((a, b) => {
    const ra = (a.stock ?? 0) / Math.max(1, (a.stock_alert ?? LOW));
    const rb = (b.stock ?? 0) / Math.max(1, (b.stock_alert ?? LOW));
    return ra - rb;
  }), [tracked]);

  const CARDS = [
    { label: 'Ruptures',        value: num(out.length),     tone: BADGE.red,    icon: 'error' },
    { label: 'Stock bas',       value: num(low.length),     tone: BADGE.orange, icon: 'warning' },
    { label: 'Stock sain',      value: num(healthy.length), tone: BADGE.green,  icon: 'check_circle' },
    { label: 'Valeur du stock', value: eur(stockValue),     tone: null,         icon: 'euro' },
  ];

  function exportCsv() {
    const rows = [['Référence', 'Produit', 'Catégorie', 'Stock', 'Seuil', 'Coût unitaire', 'Valeur']];
    for (const p of sorted) {
      rows.push([
        refOf(p), p.name_fr, catName(p.category_id),
        String(p.stock ?? 0), String(p.stock_alert ?? LOW),
        String(p.cost_price ?? ''), String(Math.round((Number(p.cost_price) || 0) * (p.stock ?? 0) * 100) / 100),
      ]);
    }
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `stock-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="sc-head">
        <div>
          <div className="sc-title">Stocks</div>
          <div className="sc-sub">Ajuste les quantités directement dans la liste — enregistrement automatique</div>
        </div>
        <div className="sc-actions">
          <Link href="/admin/achats" className="sc-btn sc-btn-secondary"><span className="ms">shopping_basket</span>Commande d’achat</Link>
          <button className="sc-btn sc-btn-secondary" onClick={exportCsv}><span className="ms">download</span>Exporter CSV</button>
        </div>
      </div>

      {/* ── 4 cartes de synthèse ────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(178px,1fr))', gap: 10, marginBottom: 12 }}>
        {CARDS.map(c => (
          <div key={c.label} style={{
            background: c.tone ? c.tone.bg : '#fff',
            border: `1px solid ${c.tone ? c.tone.fg + '22' : T.border}`,
            borderRadius: 10, padding: '13px 15px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span className="ms" style={{ fontSize: 17, color: c.tone ? c.tone.fg : T.muted }}>{c.icon}</span>
              <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1.2, textTransform: 'uppercase', color: c.tone ? c.tone.fg : T.muted }}>
                {c.label}
              </span>
            </div>
            <div className="sc-num" style={{ fontSize: 23, fontWeight: 700, marginTop: 6, color: c.tone ? c.tone.fg : T.ink }}>{c.value}</div>
          </div>
        ))}
      </div>

      {loading && <div className="sc-empty">Chargement…</div>}
      {!loading && sorted.length === 0 && (
        <div className="sc-empty">Aucun produit en suivi de stock. Active le suivi sur une fiche produit pour le voir ici.</div>
      )}

      {!loading && sorted.length > 0 && (
        <div className="sc-card" style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="sc-table" style={{ minWidth: 720 }}>
              <thead>
                <tr>
                  <th>Produit</th>
                  <th style={{ width: 160 }}>Niveau</th>
                  <th className="sc-right" style={{ width: 70 }}>Seuil</th>
                  <th style={{ width: 130 }}>Ajuster</th>
                  <th className="sc-right" style={{ width: 96 }}>Valeur</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(p => {
                  const qty = p.stock ?? 0;
                  const thr = p.stock_alert ?? LOW;
                  const gaugeMax = Math.max(qty, thr * 4, 1);
                  const color = stockColor(qty, thr);
                  return (
                    <tr key={p.id}>
                      <td>
                        <Link href={`/admin/produits/${p.id}`} style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
                          {p.image_url
                            ? <img src={p.image_url} alt="" style={thumbStyle(p.name_fr, 28)} />
                            : <div style={thumbStyle(p.name_fr, 28)}>{initials(p.name_fr, 1)}</div>}
                          <span style={{ minWidth: 0 }}>
                            <span style={{ display: 'block', fontSize: 13, fontWeight: 500, color: T.ink }}>{p.name_fr}</span>
                            <span style={{ display: 'block', fontSize: 10.5, color: T.muted }}>{refOf(p)} · {catName(p.category_id)}</span>
                          </span>
                        </Link>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                          <span className="sc-num" style={{ fontSize: 12.5, fontWeight: 700, color, minWidth: 28 }}>{qty}</span>
                          <div style={{ width: 90, height: 5, borderRadius: 2.5, background: T.borderFaint2 }}>
                            <div style={{ height: '100%', width: `${Math.min(100, (qty / gaugeMax) * 100)}%`, borderRadius: 2.5, background: color }} />
                          </div>
                        </div>
                      </td>
                      <td className="sc-num sc-right" style={{ color: T.muted }}>{thr}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <button className="sc-iconbtn" onClick={() => adjust(p, -1)} aria-label={`Retirer une unité de ${p.name_fr}`} disabled={qty <= 0}>
                            <span className="ms">remove</span>
                          </button>
                          <button className="sc-iconbtn" onClick={() => adjust(p, +1)} aria-label={`Ajouter une unité de ${p.name_fr}`}>
                            <span className="ms">add</span>
                          </button>
                          {saving.has(p.id) && <span style={{ fontSize: 10, color: T.muted }}>…</span>}
                        </div>
                      </td>
                      <td className="sc-num sc-right">{p.cost_price ? eur((Number(p.cost_price) || 0) * qty) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: T.ink, color: '#fff', padding: '10px 18px', borderRadius: 7, fontSize: 12.5, zIndex: 120 }}>
          {toast}
        </div>
      )}
    </>
  );
}
