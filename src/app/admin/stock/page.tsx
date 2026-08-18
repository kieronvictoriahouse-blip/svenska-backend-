'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { adminFetch } from '@/lib/auth-client';
import { T, BADGE, thumbStyle, initials, eur, num, stockColor } from '@/lib/admin-theme';
import BarcodeScanner from '@/components/BarcodeScanner';
import { SqueletteTable } from '@/components/Squelette';
import { useT, nomProduit } from '@/lib/admin-i18n';
import { TST } from './i18n';

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
/* Reference stable, colonne `sku` (migration 036). Le repli sur
   sort_order ne sert qu'aux bases ou la migration n'est pas passee :
   une reference derivee de l'ordre d'affichage change des qu'on
   reordonne le catalogue. */
const refOf = (p: any) =>
  p.sku || (p.sort_order ? `SC-${String(p.sort_order).padStart(4, '0')}` : String(p.id).slice(0, 6).toUpperCase());

export default function StockPage() {
  const { t, tc, lang } = useT(TST);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const timers = useRef<Record<string, any>>({});

  /* Session d'inventaire par scan (handoff v2, 2.3).
     La deduplication se fait dans la mise a jour fonctionnelle : un double
     bip sur la meme reference incremente la ligne, il n'en cree jamais deux. */
  const [invOpen, setInvOpen] = useState(false);
  const [inv, setInv] = useState<Record<string, number>>({});
  const [invBusy, setInvBusy] = useState(false);

  /* Saisie directe des quantites. Le brouillon garde ce qui est tape tant
     qu'on n'a pas valide : sans lui, taper « 12 » ecrirait 1 puis 12. */
  const [brouillon, setBrouillon] = useState<Record<string, string>>({});

  /* Ordre fige. Le tri se fait par urgence, donc changer une quantite
     deplace la ligne — et modifier dix articles la faisait sauter dix
     fois. Des qu'on touche a une valeur, l'ordre se fige jusqu'a ce
     qu'on demande explicitement de reclasser. */
  const [ordreGele, setOrdreGele] = useState<string[] | null>(null);

  /* Quantites dues aux commandes payees non expediees. Calculees cote
     serveur a partir des commandes : rien a maintenir, donc rien qui
     puisse deriver. */
  const [reserve, setReserve] = useState<Record<string, number>>({});

  /* Cible en attente d'ecriture, par produit. Deux clics rapides sur « + »
     repartaient tous deux de la valeur du dernier rendu et n'en comptaient
     qu'un : la temporisation n'envoyait que le dernier appel. */
  const cibles = useRef<Record<string, number>>({});

  /* Controle du stock : theorique (recu - vendu) confronte a la base.
     Ne vaut que la ou des receptions existent — ailleurs le stock a ete
     saisi a la main et seul un comptage physique fait foi. */
  const [ctrlOpen, setCtrlOpen] = useState(false);
  const [ctrl, setCtrl] = useState<any>(null);
  const [ctrlSel, setCtrlSel] = useState<Set<string>>(new Set());
  const [ctrlBusy, setCtrlBusy] = useState(false);

  useEffect(() => { load(); return () => Object.values(timers.current).forEach(clearTimeout); }, []);

  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2500); };

  async function load() {
    setLoading(true);
    try {
      const [p, c, r] = await Promise.all([
        adminFetch('/api/products?limit=1000').then(r => r.json()).catch(() => ({})),
        adminFetch('/api/categories').then(r => r.json()).catch(() => ({})),
        adminFetch('/api/stock/reserve').then(r => r.json()).catch(() => ({})),
      ]);
      setProducts(p.products || []);
      setCategories(c.categories || []);
      setReserve(r.reserve || {});
    } finally { setLoading(false); }
  }

  const catName = (id?: string) => categories.find(c => c.id === id)?.name_fr || '—';

  /** Ajustement immédiat côté écran, écriture différée de 700 ms.
   *  Borné à 0 minimum, comme spécifié. */
  function adjust(p: Product, delta: number) {
    const base = cibles.current[p.id] ?? (p.stock ?? 0);
    ecrire(p, Math.max(0, base + delta));
  }

  /** Pose une quantite absolue. Optimiste, puis temporisee. */
  function ecrire(p: Product, next: number) {
    if (next === (cibles.current[p.id] ?? p.stock ?? 0)) return;
    cibles.current[p.id] = next;
    geler();
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
        delete cibles.current[p.id];
        setSaving(s => { const n = new Set(s); n.delete(p.id); return n; });
      }
    }, 700);
  }

  /* On fige l'ordre au premier geste, pas au chargement : tant qu'on
     lit, la liste doit rester triee par urgence. */
  const geler = () => setOrdreGele(o => o || sorted.map(x => x.id));
  const reclasser = () => { setOrdreGele(null); setBrouillon({}); };

  /** Valide ce qui a ete tape dans une ligne. */
  function validerSaisie(p: Product) {
    const brut = brouillon[p.id];
    setBrouillon(b => { const n = { ...b }; delete n[p.id]; return n; });
    if (brut === undefined || brut === '') return;
    ecrire(p, Math.max(0, Math.round(Number(brut) || 0)));
  }

  async function loadCtrl() {
    setCtrlBusy(true);
    try {
      const d = await adminFetch('/api/stock/reconcile').then(r => r.json());
      setCtrl(d);
      setCtrlSel(new Set((d.rows || [])
        .filter((r: any) => r.reconciliable && r.ecart !== 0)
        .map((r: any) => r.product_id)));
    } catch { say(t('msgControleKo')); }
    finally { setCtrlBusy(false); }
  }

  async function applyCtrl() {
    if (!ctrlSel.size) return;
    if (!window.confirm(`Aligner le stock de ${ctrlSel.size} produit(s) sur le theorique ?`)) return;
    setCtrlBusy(true);
    try {
      const res = await adminFetch('/api/stock/reconcile', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_ids: Array.from(ctrlSel) }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Erreur');
      setProducts(ps => ps.map(p => {
        const hit = (d.applied || []).find((a: any) => a.product_id === p.id);
        return hit ? { ...p, stock: hit.after } : p;
      }));
      say(`${(d.applied || []).length} produit(s) aligne(s)`);
      await loadCtrl();
    } catch (e: any) { say(e.message); }
    finally { setCtrlBusy(false); }
  }

  async function onInvScan(code: string) {
    let p: any = products.find(x => (x as any).ean === code);
    if (!p) {
      try {
        const d = await adminFetch(`/api/scan?ean=${encodeURIComponent(code)}`).then(r => r.json());
        if (d.found && d.product) p = d.product;
      } catch { /* hors ligne : message ci-dessous */ }
    }
    if (!p) { say(`Code ${code} inconnu - renseigne l'EAN sur la fiche produit`); return; }
    const id = p.id;
    setInv(prev => ({ ...prev, [id]: (prev[id] || 0) + 1 }));
  }

  async function applyInventory() {
    const entries = Object.entries(inv);
    if (!entries.length) return;
    setInvBusy(true);
    try {
      const res = await adminFetch('/api/stock/movement', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: 'inventory',
          reference: `INV-${new Date().toISOString().slice(0, 10)}`,
          items: entries.map(([product_id, counted]) => ({ product_id, counted })),
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Erreur');
      setProducts(ps => ps.map(p => {
        const hit = (d.applied || []).find((a: any) => a.product_id === p.id);
        return hit ? { ...p, stock: hit.after } : p;
      }));
      say(`${(d.applied || []).length} reference(s) ajustee(s)`);
      setInv({}); setInvOpen(false);
    } catch (e: any) { say(e.message); }
    finally { setInvBusy(false); }
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

  /* Les nouveaux produits (filtre change, rechargement) se placent apres
     ceux deja affiches plutot que de disparaitre. */
  const affichees = useMemo(() => {
    if (!ordreGele) return sorted;
    const rang = new Map(ordreGele.map((id, i) => [id, i]));
    return [...sorted].sort((a, b) => {
      const ra = rang.has(a.id) ? rang.get(a.id)! : Number.MAX_SAFE_INTEGER;
      const rb = rang.has(b.id) ? rang.get(b.id)! : Number.MAX_SAFE_INTEGER;
      return ra - rb;
    });
  }, [sorted, ordreGele]);

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
          <div className="sc-title">{t('titre')}</div>
          <div className="sc-sub">{t('sous')}</div>
        </div>
        <div className="sc-actions">
          <Link href="/admin/achats" className="sc-btn sc-btn-secondary"><span className="ms">shopping_basket</span>{t('cmdAchat')}</Link>
          <button className="sc-btn" onClick={() => setInvOpen(v => !v)}
                  style={{ background: '#F3EDF3', color: '#6E4470', border: '1px solid #E3D6E3' }}>
            <span className="ms">barcode_scanner</span>{t('invScan')}
          </button>
          <button className="sc-btn sc-btn-secondary"
                  onClick={() => { const n = !ctrlOpen; setCtrlOpen(n); if (n && !ctrl) loadCtrl(); }}>
            <span className="ms">fact_check</span>{t('controle')}
          </button>
          <Link className="sc-btn sc-btn-secondary" href="/admin/stock/historique">
            <span className="ms">history</span>{t('historique')}
          </Link>
          <button className="sc-btn sc-btn-secondary" onClick={exportCsv}><span className="ms">download</span>{t('exporter')}</button>
        </div>
      </div>
      {/* Controle du stock : recu - vendu confronte a la base */}
      {ctrlOpen && (
        <div className="sc-card" style={{ marginBottom: 12, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 15px', background: T.surfaceAlt, flexWrap: 'wrap' }}>
            <span className="ms" style={{ fontSize: 19, color: T.muted }}>fact_check</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>{t('controleTitre')}</div>
              <div style={{ fontSize: 11, color: T.text3 }}>
                Th&eacute;orique = total re&ccedil;u &minus; total vendu, recalcul&eacute; depuis les r&eacute;ceptions et les commandes.
              </div>
            </div>
            <button className="sc-btn sc-btn-secondary" style={{ padding: '5px 10px', fontSize: 11 }} onClick={loadCtrl} disabled={ctrlBusy}>{t('recalculer')}</button>
            <button className="sc-btn sc-btn-secondary" style={{ padding: '5px 10px', fontSize: 11 }} onClick={() => setCtrlOpen(false)}>{tc('close')}</button>
          </div>

          {!ctrl ? (
            <div className="sc-empty">{ctrlBusy ? 'Calcul en cours\u2026' : 'Aucun r\u00e9sultat'}</div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 20, padding: '11px 15px', borderBottom: `1px solid ${T.border}`, flexWrap: 'wrap' }}>
                <div>
                  <span className="sc-num" style={{ fontSize: 19, fontWeight: 700, color: ctrl.resume.en_ecart ? T.red : T.green }}>{ctrl.resume.en_ecart}</span>
                  <span style={{ fontSize: 11.5, color: T.muted, marginLeft: 6 }}>produit(s) en &eacute;cart</span>
                </div>
                <div>
                  <span className="sc-num" style={{ fontSize: 19, fontWeight: 700, color: T.ink }}>+{ctrl.resume.surstock}</span>
                  <span style={{ fontSize: 11.5, color: T.muted, marginLeft: 6 }}>unit&eacute;(s) de stock fant&ocirc;me</span>
                </div>
                <div>
                  <span className="sc-num" style={{ fontSize: 19, fontWeight: 700, color: T.ink }}>{ctrl.resume.a_compter}</span>
                  <span style={{ fontSize: 11.5, color: T.muted, marginLeft: 6 }}>&agrave; compter physiquement</span>
                </div>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table className="sc-table">
                  <thead>
                    <tr>
                      <th style={{ width: 34 }}></th>
                      <th>{tc('product')}</th>
                      <th style={{ width: 70, textAlign: 'right' }}>{t('recu')}</th>
                      <th style={{ width: 70, textAlign: 'right' }}>{t('vendu')}</th>
                      <th style={{ width: 82, textAlign: 'right' }}>{t('theorique')}</th>
                      <th style={{ width: 72, textAlign: 'right' }}>{t('enBase')}</th>
                      <th style={{ width: 78, textAlign: 'right' }}>&Eacute;cart</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ctrl.rows.filter((r: any) => r.ecart !== 0 || !r.reconciliable).map((r: any) => (
                      <tr key={r.product_id} style={{ opacity: r.reconciliable ? 1 : 0.62 }}>
                        <td>
                          {r.reconciliable && r.ecart !== 0 ? (
                            <input type="checkbox" checked={ctrlSel.has(r.product_id)} style={{ accentColor: 'var(--accent)' }}
                                   onChange={() => setCtrlSel(prev => {
                                     const n = new Set(prev);
                                     if (n.has(r.product_id)) n.delete(r.product_id); else n.add(r.product_id);
                                     return n;
                                   })} />
                          ) : (
                            <span className="ms" style={{ fontSize: 15, color: T.muted }}>help</span>
                          )}
                        </td>
                        <td>
                          <div style={{ fontSize: 12.5, color: T.ink }}>{r.name}</div>
                          {!r.reconciliable && (
                            <div style={{ fontSize: 10.5, color: T.muted }}>
                              Jamais entr&eacute; par une r&eacute;ception &mdash; comptage requis
                            </div>
                          )}
                        </td>
                        <td className="sc-num" style={{ textAlign: 'right' }}>{r.received}</td>
                        <td className="sc-num" style={{ textAlign: 'right' }}>{r.sold}</td>
                        <td className="sc-num" style={{ textAlign: 'right', fontWeight: 600 }}>{r.reconciliable ? r.theorique : '\u2014'}</td>
                        <td className="sc-num" style={{ textAlign: 'right' }}>{r.base}</td>
                        <td className="sc-num" style={{ textAlign: 'right', fontWeight: 700, color: r.ecart === 0 ? T.muted : r.ecart > 0 ? T.red : T.blue }}>
                          {r.reconciliable ? (r.ecart > 0 ? `+${r.ecart}` : r.ecart) : '\u2014'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 15px', background: T.surfaceAlt, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11.5, color: T.muted, flex: 1 }}>
                  L&rsquo;alignement cr&eacute;e un mouvement dat&eacute; et motiv&eacute; par produit. Les lignes gris&eacute;es ne sont pas calculables.
                </span>
                <button className="sc-btn sc-btn-green" onClick={applyCtrl} disabled={ctrlBusy || !ctrlSel.size}>
                  <span className="ms">check_circle</span>{ctrlBusy ? 'Alignement\u2026' : `Aligner ${ctrlSel.size} produit(s)`}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Session d'inventaire par scan */}
      {invOpen && (
        <div className="sc-card" style={{ border: '1px solid #E3D6E3', marginBottom: 12, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 15px', background: '#F9F5F9', flexWrap: 'wrap' }}>
            <span className="ms" style={{ fontSize: 19, color: '#6E4470' }}>inventory</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#5E3B5E' }}>{t('session')}</div>
              <div style={{ fontSize: 11, color: '#6E4470' }}>
                {Object.keys(inv).length} r&eacute;f&eacute;rence(s) compt&eacute;e(s) &middot; scanne chaque produit puis corrige la quantit&eacute;
              </div>
            </div>
            <button className="sc-btn sc-btn-secondary" style={{ padding: '5px 10px', fontSize: 11 }} onClick={() => setInv({})}>{t('vider')}</button>
            <button className="sc-btn sc-btn-secondary" style={{ padding: '5px 10px', fontSize: 11 }} onClick={() => setInvOpen(false)}>{tc('close')}</button>
          </div>

          <div style={{ display: 'flex', gap: 12, padding: 15, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ width: 220, flexShrink: 0 }}>
              <BarcodeScanner compact onScan={onInvScan} label="Scanne un produit" />
            </div>

            <div style={{ flex: '1 1 300px', minWidth: 0 }}>
              {Object.keys(inv).length === 0 ? (
                <div style={{
                  border: `1px dashed ${T.borderField}`, borderRadius: 9, padding: '28px 18px',
                  textAlign: 'center', fontSize: 12, color: T.muted,
                }}>
                  Aucun article compt&eacute; pour l&rsquo;instant. Scanne un premier produit pour d&eacute;marrer la session.
                </div>
              ) : (
                Object.entries(inv).map(([id, counted]) => {
                  const p = products.find(x => x.id === id);
                  if (!p) return null;
                  const theo = p.stock ?? 0;
                  const gap = counted - theo;
                  return (
                    <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: `1px solid ${T.borderFaint}` }}>
                      {p.image_url
                        ? <img src={p.image_url} alt="" style={thumbStyle(p.name_fr, 28)} />
                        : <div style={thumbStyle(p.name_fr, 28)}>{initials(p.name_fr, 1)}</div>}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, color: T.ink }}>{nomProduit(p, lang)}</div>
                        <div className="sc-num" style={{ fontSize: 10.5, color: T.muted }}>{refOf(p)} &middot; th&eacute;orique {theo}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <button className="sc-iconbtn" style={{ width: 28, height: 28 }}
                                onClick={() => setInv(s => ({ ...s, [id]: Math.max(0, (s[id] || 0) - 1) }))} aria-label={t('moins')}>
                          <span className="ms">remove</span>
                        </button>
                        <span className="sc-num" style={{ fontSize: 13, fontWeight: 700, minWidth: 26, textAlign: 'center' }}>{counted}</span>
                        <button className="sc-iconbtn" style={{ width: 28, height: 28 }}
                                onClick={() => setInv(s => ({ ...s, [id]: (s[id] || 0) + 1 }))} aria-label="Plus">
                          <span className="ms">add</span>
                        </button>
                      </div>
                      <span className="sc-num" style={{
                        minWidth: 44, textAlign: 'right', fontSize: 12.5, fontWeight: 600,
                        color: gap === 0 ? T.muted : gap > 0 ? T.blue : T.red,
                      }}>{gap > 0 ? `+${gap}` : gap}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 15px', background: T.surfaceAlt, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11.5, color: T.muted, flex: 1 }}>
              Les &eacute;carts cr&eacute;ent un mouvement de stock dat&eacute; et sign&eacute;.
            </span>
            <button className="sc-btn sc-btn-green" onClick={applyInventory} disabled={invBusy || !Object.keys(inv).length}>
              <span className="ms">check_circle</span>{invBusy ? 'Ajustement...' : 'Ajuster le stock'}
            </button>
          </div>
        </div>
      )}

      {/* 4 cartes de synthese */}
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

      {loading && <SqueletteTable lignes={8} colonnes={5} vignette />}
      {!loading && sorted.length === 0 && (
        <div className="sc-empty">{t('aucun')}</div>
      )}

      {/* L'ordre est fige des qu'on modifie une quantite : sans ca, le tri
          par urgence deplace la ligne a chaque clic. */}
      {!loading && ordreGele && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10,
          background: '#FBF9F6', border: `1px solid ${T.border}`, borderRadius: 9, padding: '9px 13px',
        }}>
          <span className="ms" style={{ fontSize: 17, color: T.muted }}>lock</span>
          <span style={{ fontSize: 12, color: T.text2b, flex: 1 }}>{t('ordreGele')}</span>
          <button className="sc-btn sc-btn-secondary" style={{ padding: '4px 11px', fontSize: 11.5 }}
                  onClick={reclasser}>
            <span className="ms" style={{ fontSize: 15 }}>sort</span>{t('reclasser')}
          </button>
        </div>
      )}

      {!loading && sorted.length > 0 && (
        <div className="sc-card" style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="sc-table" style={{ minWidth: 720 }}>
              <thead>
                <tr>
                  <th>{tc('product')}</th>
                  <th style={{ width: 160 }}>{t('niveau')}</th>
                  <th className="sc-right" style={{ width: 70 }}>{t('seuil')}</th>
                  <th style={{ width: 130 }}>{t('ajuster')}</th>
                  <th className="sc-right" style={{ width: 78 }}>{t('reserve')}</th>
                  <th className="sc-right" style={{ width: 84 }}>{t('disponible')}</th>
                  <th className="sc-right" style={{ width: 96 }}>{t('valeur')}</th>
                  <th style={{ width: 44 }} />
                </tr>
              </thead>
              <tbody>
                {affichees.map(p => {
                  const qty = p.stock ?? 0;
                  /* Trois nombres distincts : ce qu'il y a en rayon, ce
                     qui est deja du, et ce qu'on peut encore vendre. */
                  const dus = reserve[p.id] || 0;
                  const dispo = qty - dus;
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
                            <span style={{ display: 'block', fontSize: 13, fontWeight: 500, color: T.ink }}>{nomProduit(p, lang)}</span>
                            <span style={{ display: 'block', fontSize: 10.5, color: T.muted }}>{refOf(p)} · {catName(p.category_id)}</span>
                          </span>
                        </Link>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                          <input
                            className="sc-input sc-num"
                            inputMode="numeric"
                            aria-label={`${t('quantite')} — ${nomProduit(p, lang)}`}
                            value={brouillon[p.id] ?? String(qty)}
                            onChange={e => setBrouillon(b => ({ ...b, [p.id]: e.target.value.replace(/[^\d]/g, '') }))}
                            onFocus={e => { geler(); e.currentTarget.select(); }}
                            onBlur={() => validerSaisie(p)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') { e.currentTarget.blur(); }
                              else if (e.key === 'Escape') {
                                setBrouillon(b => { const n = { ...b }; delete n[p.id]; return n; });
                                e.currentTarget.blur();
                              }
                            }}
                            style={{
                              width: 52, height: 28, padding: '0 4px', textAlign: 'center',
                              fontSize: 12.5, fontWeight: 700, color,
                            }} />
                          <div style={{ width: 90, height: 5, borderRadius: 2.5, background: T.borderFaint2 }}>
                            <div style={{ height: '100%', width: `${Math.min(100, (qty / gaugeMax) * 100)}%`, borderRadius: 2.5, background: color }} />
                          </div>
                        </div>
                      </td>
                      <td className="sc-num sc-right" style={{ color: T.muted }}>{thr}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <button className="sc-iconbtn" onClick={() => adjust(p, -1)} aria-label={`− ${nomProduit(p, lang)}`} disabled={qty <= 0}>
                            <span className="ms">remove</span>
                          </button>
                          <button className="sc-iconbtn" onClick={() => adjust(p, +1)} aria-label={`+ ${nomProduit(p, lang)}`}>
                            <span className="ms">add</span>
                          </button>
                          {saving.has(p.id) && <span style={{ fontSize: 10, color: T.muted }}>…</span>}
                        </div>
                      </td>
                      <td className="sc-num sc-right" style={{ color: dus > 0 ? '#8A5B08' : T.muted3 }}>
                        {dus > 0 ? dus : '—'}
                      </td>
                      <td className="sc-num sc-right" style={{
                        fontWeight: 700,
                        color: dispo <= 0 ? T.red : dispo <= thr ? '#8A5B08' : T.ink,
                      }}>{dispo}</td>
                      <td className="sc-num sc-right">{p.cost_price ? eur((Number(p.cost_price) || 0) * qty) : '—'}</td>
                      <td>
                        <Link className="sc-iconbtn" title={t('historiqueDe')}
                              href={`/admin/stock/historique?produit=${p.id}`}>
                          <span className="ms" style={{ fontSize: 17 }}>history</span>
                        </Link>
                      </td>
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
