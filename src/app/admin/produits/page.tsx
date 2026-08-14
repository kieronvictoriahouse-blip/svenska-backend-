'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import BarcodeScanner from '@/components/BarcodeScanner';
import { adminFetch } from '@/lib/auth-client';
import { T, BADGE, BadgeTone, thumbStyle, initials, eur, stockColor } from '@/lib/admin-theme';

/* ═══════════════════════════════════════════════════════════════
   ÉCRAN 2 — PRODUITS
   Handoff « Redesign du back office », §2. En-tête collant sur trois
   rangées, filtres cumulatifs, sélection groupée, table dense en
   desktop / cartes en mobile.
   ═══════════════════════════════════════════════════════════════ */

type Product = {
  id: string; name_fr: string; name_sv?: string; name_en?: string;
  price: number; cost_price?: number; image_url?: string;
  category_id?: string; is_active?: boolean;
  stock?: number; stock_alert?: number; track_stock?: boolean;
  sort_order?: number;
};
type Category = { id: string; name_fr: string; emoji?: string };

/* Seuil de stock bas. La base porte un `stock_alert` PAR PRODUIT ; ce 12
   n'est qu'un repli quand il n'est pas renseigne. Avant, le filtre et les
   compteurs utilisaient le 12 pour tout le monde pendant que la couleur
   suivait le seuil du produit : deux verites a l'ecran. */
const LOW_STOCK = 12;
const seuilDe = (p: Product) => p.stock_alert ?? LOW_STOCK;
const TVA_RATE = 1.055;          // marge = (PV/1,055 − PA) / (PV/1,055)

/** Référence affichée : la base n'a pas de champ SKU, on la dérive du sort_order. */
/* Reference stable, colonne `sku` (migration 036). Le repli sur
   sort_order ne sert qu'aux bases ou la migration n'est pas passee :
   une reference derivee de l'ordre d'affichage change des qu'on
   reordonne le catalogue. */
const refOf = (p: any) =>
  p.sku || (p.sort_order ? `SC-${String(p.sort_order).padStart(4, '0')}` : String(p.id).slice(0, 6).toUpperCase());

const marginPct = (price: number, cost?: number) => {
  const ht = (Number(price) || 0) / TVA_RATE;
  const c = Number(cost) || 0;
  if (!ht || !c) return null;
  return Math.round(((ht - c) / ht) * 100);
};

export default function ProduitsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [stat, setStat] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  /* Creation par scan : la page /produits/nouveau redirige d'elle-meme
     vers la fiche si l'EAN est deja au catalogue. */
  const [scanOpen, setScanOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [mobile, setMobile] = useState(false);
  const [showCosts, setShowCosts] = useState(true);
  const [priceModal, setPriceModal] = useState(false);
  const [pricePct, setPricePct] = useState('');

  useEffect(() => {
    const r = () => setMobile(window.innerWidth < 900);
    r(); window.addEventListener('resize', r);
    return () => window.removeEventListener('resize', r);
  }, []);

  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get('q');
    if (initial) setQ(initial);
    load();
  }, []);

  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3500); };

  async function load() {
    setLoading(true);
    try {
      const [p, c] = await Promise.all([
        adminFetch('/api/products?limit=1000').then(r => r.json()).catch(() => ({})),
        adminFetch('/api/categories').then(r => r.json()).catch(() => ({})),
      ]);
      setProducts(p.products || []);
      setCategories(c.categories || []);
    } finally { setLoading(false); }
  }

  /* ── Filtres cumulatifs : recherche ∧ catégorie ∧ statut ── */
  const filtered = useMemo(() => products.filter(p => {
    const needle = q.trim().toLowerCase();
    const okQ = !needle
      || p.name_fr?.toLowerCase().includes(needle)
      || p.name_sv?.toLowerCase().includes(needle)
      || refOf(p).toLowerCase().includes(needle);
    const okCat = !cat || p.category_id === cat;
    const qty = p.stock ?? 0;
    const okStat = !stat
      || (stat === 'active' && p.is_active)
      || (stat === 'draft' && !p.is_active)
      || (stat === 'low' && p.track_stock && qty <= seuilDe(p));
    return okQ && okCat && okStat;
  }), [products, q, cat, stat]);

  const allChecked = filtered.length > 0 && filtered.every(p => sel.has(p.id));
  const toggleAll = () => setSel(allChecked ? new Set() : new Set(filtered.map(p => p.id)));
  const toggle = (id: string) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const catName = (id?: string) => categories.find(c => c.id === id)?.name_fr || '—';

  /* ── Actions groupées ─────────────────────────────────── */
  async function bulkUnpublish() {
    if (!sel.size) return;
    setBusy(true);
    try {
      await Promise.all(Array.from(sel).map(id =>
        adminFetch(`/api/products/${id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_active: false }),
        })));
      setProducts(ps => ps.map(p => sel.has(p.id) ? { ...p, is_active: false } : p));
      say(`${sel.size} produit(s) dépublié(s)`);
      setSel(new Set());
    } finally { setBusy(false); }
  }

  async function bulkDelete() {
    if (!sel.size) return;
    if (!window.confirm(`Supprimer définitivement ${sel.size} produit(s) ? Cette action est irréversible.`)) return;
    setBusy(true);
    try {
      await Promise.all(Array.from(sel).map(id => adminFetch(`/api/products/${id}`, { method: 'DELETE' })));
      setProducts(ps => ps.filter(p => !sel.has(p.id)));
      say(`${sel.size} produit(s) supprimé(s)`);
      setSel(new Set());
    } finally { setBusy(false); }
  }

  async function bulkPrice() {
    const pct = parseFloat(pricePct.replace(',', '.'));
    if (!pct || Number.isNaN(pct)) { say('Indique un pourcentage, ex. 5 ou −3'); return; }
    setBusy(true);
    try {
      const targets = products.filter(p => sel.has(p.id));
      await Promise.all(targets.map(p => {
        const next = Math.round((Number(p.price) || 0) * (1 + pct / 100) * 100) / 100;
        return adminFetch(`/api/products/${p.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ price: next }),
        });
      }));
      setProducts(ps => ps.map(p => sel.has(p.id)
        ? { ...p, price: Math.round((Number(p.price) || 0) * (1 + pct / 100) * 100) / 100 } : p));
      say(`Prix ajustés de ${pct > 0 ? '+' : ''}${pct} % sur ${targets.length} produit(s)`);
      setPriceModal(false); setPricePct(''); setSel(new Set());
    } finally { setBusy(false); }
  }

  async function duplicate(p: Product) {
    setBusy(true);
    try {
      const { id, ...rest } = p as any;
      const res = await adminFetch('/api/products', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...rest, name_fr: `${p.name_fr} (copie)`, is_active: false }),
      });
      if (!res.ok) throw new Error();
      say('Produit dupliqué');
      load();
    } catch { say('Duplication impossible'); }
    finally { setBusy(false); }
  }

  /** Rapatriement des images externes dans le Storage (hors maquette,
   *  conservé : les hotlinks fournisseurs meurent régulièrement). */
  async function rehost() {
    if (!window.confirm('Rapatrier toutes les images externes dans le Storage ?')) return;
    setBusy(true);
    try {
      const res = await adminFetch('/api/admin/rehost-images', { method: 'POST' });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Erreur serveur');
      say(`${d.rehosted}/${d.total_external} image(s) rapatriée(s)`);
      load();
    } catch (e: any) { say(e.message); }
    finally { setBusy(false); }
  }

  const statusOf = (p: Product): { label: string; tone: BadgeTone } => {
    if (!p.is_active) return { label: 'Brouillon', tone: 'gray' };
    const qty = p.stock ?? 0;
    if (p.track_stock && qty <= 0) return { label: 'Rupture', tone: 'red' };
    if (p.track_stock && qty <= seuilDe(p)) return { label: 'Stock bas', tone: 'orange' };
    return { label: 'Actif', tone: 'green' };
  };

  const lowCount = products.filter(p => p.track_stock && (p.stock ?? 0) <= seuilDe(p)).length;

  const stickyHead: React.CSSProperties = {
    position: 'sticky', top: 0, zIndex: 20, background: '#fff',
    margin: '-16px -18px 14px', padding: '14px 18px 12px',
    borderBottom: `1px solid ${T.border}`,
  };

  return (
    <>
      {/* ── En-tête collant ─────────────────────────────── */}
      <div style={stickyHead}>
        <div className="sc-head" style={{ marginBottom: 12 }}>
          <div>
            <div className="sc-title">Produits</div>
            <div className="sc-sub">
              {filtered.length} produit{filtered.length > 1 ? 's' : ''}
              {filtered.length !== products.length ? ` sur ${products.length}` : ''}
              {lowCount > 0 ? ` · ${lowCount} sous le seuil` : ''}
            </div>
          </div>
          <div className="sc-actions">
            <button className="sc-btn sc-btn-secondary" onClick={rehost} disabled={busy} title="Rapatrier les images externes dans le Storage">
              <span className="ms">cloud_upload</span>Images
            </button>
            <button className="sc-btn" onClick={() => setScanOpen(v => !v)}
                    style={{ background: '#F3EDF3', color: '#6E4470', border: '1px solid #E3D6E3' }}>
              <span className="ms">barcode_scanner</span>Créer par scan
            </button>
            <Link href="/admin/import" className="sc-btn sc-btn-secondary"><span className="ms">upload</span>Importer</Link>
            <Link href="/admin/produits/nouveau" className="sc-btn sc-btn-primary"><span className="ms">add</span>Nouveau</Link>
          </div>
        </div>

        {/* Creation par scan */}
        {scanOpen && (
          <div className="sc-card" style={{ border: '1px solid #E3D6E3', marginBottom: 12, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 15px', background: '#F9F5F9', flexWrap: 'wrap' }}>
              <span className="ms" style={{ fontSize: 19, color: '#6E4470' }}>barcode_scanner</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#5E3B5E' }}>Cr&eacute;er un article par scan</div>
                <div style={{ fontSize: 11, color: '#6E4470' }}>
                  Si le code est d&eacute;j&agrave; au catalogue, sa fiche s&rsquo;ouvre au lieu de cr&eacute;er un doublon.
                </div>
              </div>
              <button className="sc-btn sc-btn-secondary" style={{ padding: '5px 10px', fontSize: 11 }} onClick={() => setScanOpen(false)}>Fermer</button>
            </div>
            <div style={{ padding: 15, maxWidth: 300 }}>
              <BarcodeScanner compact label="Scanne l&rsquo;article"
                              onScan={code => router.push(`/admin/produits/nouveau?ean=${encodeURIComponent(code)}`)} />
            </div>
          </div>
        )}

        {/* Filtres */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            className="sc-input"
            style={{ height: 32, flex: '1 1 220px', maxWidth: 320, background: '#F7F4EF' }}
            placeholder="Rechercher un produit, une référence…"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
          <button className={`sc-chip${cat === '' ? ' on' : ''}`} onClick={() => setCat('')}>Toutes</button>
          {categories.map(c => (
            <button key={c.id} className={`sc-chip${cat === c.id ? ' on' : ''}`} onClick={() => setCat(c.id)}>{c.name_fr}</button>
          ))}
          <span style={{ flex: 1 }} />
          {[['', 'Tous'], ['active', 'Actifs'], ['low', 'Stock bas'], ['draft', 'Brouillons']].map(([v, l]) => (
            <button key={v} className={`sc-chip${stat === v ? ' on' : ''}`} onClick={() => setStat(v)}>{l}</button>
          ))}
          {!mobile && (
            <button className="sc-chip" onClick={() => setShowCosts(v => !v)} title="Afficher / masquer coût et marge">
              <span className="ms" style={{ fontSize: 16 }}>{showCosts ? 'visibility_off' : 'visibility'}</span>
              {showCosts ? 'Masquer coûts' : 'Afficher coûts'}
            </button>
          )}
        </div>

        {/* Barre de sélection groupée */}
        {sel.size > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
            background: '#F3EDF3', border: '1px solid #E3D6E3', borderRadius: 8,
            padding: '8px 12px', marginTop: 10,
          }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: '#6E4470' }}>
              {sel.size} produit{sel.size > 1 ? 's' : ''} sélectionné{sel.size > 1 ? 's' : ''}
            </span>
            <span style={{ flex: 1 }} />
            <button className="sc-btn sc-btn-secondary" onClick={() => setPriceModal(true)} disabled={busy}>
              <span className="ms">sell</span>Modifier les prix
            </button>
            <button className="sc-btn sc-btn-secondary" onClick={bulkUnpublish} disabled={busy}>
              <span className="ms">visibility_off</span>Dépublier
            </button>
            <button className="sc-btn sc-btn-danger" onClick={bulkDelete} disabled={busy}>
              <span className="ms">delete</span>Supprimer
            </button>
            <button className="sc-btn sc-btn-secondary" onClick={() => setSel(new Set())}>Annuler</button>
          </div>
        )}
      </div>

      {/* ── Contenu ─────────────────────────────────────── */}
      {loading && <div className="sc-empty">Chargement…</div>}
      {!loading && filtered.length === 0 && <div className="sc-empty">Aucun produit ne correspond à ces filtres.</div>}

      {/* Desktop : table */}
      {!loading && !mobile && filtered.length > 0 && (
        <div className="sc-card" style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="sc-table" style={{ minWidth: 760 }}>
              <thead>
                <tr>
                  <th style={{ width: 38 }}>
                    <input type="checkbox" checked={allChecked} onChange={toggleAll} aria-label="Tout sélectionner" />
                  </th>
                  <th style={{ width: 92 }}>Réf.</th>
                  <th>Produit</th>
                  <th style={{ width: 140 }}>Catégorie</th>
                  <th className="sc-right" style={{ width: 84 }}>Prix</th>
                  {showCosts && <th className="sc-right" style={{ width: 84 }}>Coût</th>}
                  {showCosts && <th className="sc-right" style={{ width: 74 }}>Marge</th>}
                  <th style={{ width: 118 }}>Stock</th>
                  <th style={{ width: 104 }}>Statut</th>
                  <th style={{ width: 96 }} />
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => {
                  const checked = sel.has(p.id);
                  const qty = p.stock ?? 0;
                  const thr = seuilDe(p);
                  const gaugeMax = Math.max(qty, thr * 4, 1);
                  const m = marginPct(p.price, p.cost_price);
                  const st = statusOf(p);
                  return (
                    <tr key={p.id} style={checked ? { background: 'color-mix(in srgb, var(--accent) 4%, transparent)' } : undefined}>
                      <td><input type="checkbox" checked={checked} onChange={() => toggle(p.id)} aria-label={`Sélectionner ${p.name_fr}`} /></td>
                      <td className="sc-num" style={{ fontSize: 11.5, color: T.muted }}>{refOf(p)}</td>
                      <td>
                        <Link href={`/admin/produits/${p.id}`} style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
                          {p.image_url
                            ? <img src={p.image_url} alt="" style={thumbStyle(p.name_fr, 28)} />
                            : <div style={thumbStyle(p.name_fr, 28)}>{initials(p.name_fr, 1)}</div>}
                          <span style={{ fontSize: 13, fontWeight: 500, color: T.ink }}>{p.name_fr}</span>
                        </Link>
                      </td>
                      <td>{catName(p.category_id)}</td>
                      <td className="sc-num sc-right">{eur(p.price)}</td>
                      {showCosts && <td className="sc-num sc-right" style={{ color: T.muted }}>{p.cost_price ? eur(p.cost_price) : '—'}</td>}
                      {showCosts && <td className="sc-num sc-right" style={{ color: m != null ? T.green : T.muted3, fontWeight: 600 }}>{m != null ? `${m} %` : '—'}</td>}
                      <td>
                        {p.track_stock ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span className="sc-num" style={{ fontSize: 12.5, fontWeight: 700, color: stockColor(qty, thr), minWidth: 26 }}>{qty}</span>
                            <div style={{ width: 44, height: 4, borderRadius: 2, background: T.borderFaint2 }}>
                              <div style={{ height: '100%', width: `${Math.min(100, (qty / gaugeMax) * 100)}%`, borderRadius: 2, background: stockColor(qty, thr) }} />
                            </div>
                          </div>
                        ) : <span style={{ color: T.muted3 }}>non suivi</span>}
                      </td>
                      <td><span className="sc-badge" style={{ background: BADGE[st.tone].bg, color: BADGE[st.tone].fg }}>{st.label}</span></td>
                      <td>
                        <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                          <Link href={`/admin/produits/${p.id}`} className="sc-iconbtn" title="Modifier"><span className="ms">edit</span></Link>
                          <button className="sc-iconbtn" title="Dupliquer" onClick={() => duplicate(p)} disabled={busy}><span className="ms">content_copy</span></button>
                          <button
                            className="sc-iconbtn"
                            title={p.is_active ? 'Dépublier' : 'Publier'}
                            onClick={async () => {
                              await adminFetch(`/api/products/${p.id}`, {
                                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ is_active: !p.is_active }),
                              });
                              setProducts(ps => ps.map(x => x.id === p.id ? { ...x, is_active: !p.is_active } : x));
                              say(p.is_active ? 'Produit masqué' : 'Produit publié');
                            }}
                          >
                            <span className="ms">{p.is_active ? 'visibility_off' : 'visibility'}</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Mobile : cartes */}
      {!loading && mobile && filtered.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(p => {
            const st = statusOf(p);
            return (
              <Link key={p.id} href={`/admin/produits/${p.id}`} className="sc-card"
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, textDecoration: 'none' }}>
                {p.image_url
                  ? <img src={p.image_url} alt="" style={thumbStyle(p.name_fr, 46)} />
                  : <div style={thumbStyle(p.name_fr, 46)}>{initials(p.name_fr, 1)}</div>}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: T.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name_fr}</span>
                    <span className="sc-badge" style={{ background: BADGE[st.tone].bg, color: BADGE[st.tone].fg, flexShrink: 0 }}>{st.label}</span>
                  </div>
                  <div style={{ fontSize: 10.5, color: T.muted, marginTop: 2 }}>{refOf(p)} · {catName(p.category_id)}</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
                    <span className="sc-num" style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>{eur(p.price)}</span>
                    {p.track_stock && <span style={{ fontSize: 11, color: stockColor(p.stock ?? 0, p.stock_alert ?? LOW_STOCK) }}>{p.stock ?? 0} en stock</span>}
                  </div>
                </div>
                <span className="ms" style={{ fontSize: 18, color: T.muted3 }}>chevron_right</span>
              </Link>
            );
          })}
        </div>
      )}

      {/* ── Modale « Modifier les prix » ─────────────────── */}
      {priceModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(21,24,30,.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
             onClick={e => { if (e.target === e.currentTarget) setPriceModal(false); }}>
          <div className="sc-card" style={{ width: '100%', maxWidth: 380, padding: 18 }}>
            <div className="sc-card-title" style={{ marginBottom: 4 }}>Modifier les prix</div>
            <div style={{ fontSize: 11.5, color: T.text3, marginBottom: 14 }}>
              Appliqué aux {sel.size} produit(s) sélectionné(s). Un nombre négatif baisse les prix.
            </div>
            <label className="sc-label">Variation en %</label>
            <input className="sc-input" autoFocus value={pricePct} placeholder="ex. 5 ou -3"
                   onChange={e => setPricePct(e.target.value)}
                   onKeyDown={e => { if (e.key === 'Enter') bulkPrice(); }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button className="sc-btn sc-btn-secondary" onClick={() => setPriceModal(false)}>Annuler</button>
              <button className="sc-btn sc-btn-primary" onClick={bulkPrice} disabled={busy}>Appliquer</button>
            </div>
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
