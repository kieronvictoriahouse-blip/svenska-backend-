'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import BarcodeScanner from '@/components/BarcodeScanner';
import { MenuActions, MenuItem, MenuSep } from '@/components/MenuActions';
import { adminFetch } from '@/lib/auth-client';
import { T, BADGE, BadgeTone, thumbStyle, initials, eur, stockColor } from '@/lib/admin-theme';
import { SqueletteTable, SqueletteListe } from '@/components/Squelette';
import { useT, nomProduit } from '@/lib/admin-i18n';
import { useIsMobile } from '@/lib/use-mobile';
import { ADMIN_SEARCH_EVENT } from '@/lib/admin-nav';
import { resolveDiscount, effectiveUnitPrice, DiscountFields } from '@/lib/product-price';
import { TPR } from './i18n';

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
  discount_type?: string | null; discount_value?: number | string | null;
  discount_start?: string | null; discount_end?: string | null;
  categories?: DiscountFields | null;
  product_variants?: Array<{ label: string; price: number; sort_order?: number }>;
};
type Category = { id: string; name_fr: string; emoji?: string };

/* Seuil de stock bas. La base porte un `stock_alert` PAR PRODUIT ; ce 12
   n'est qu'un repli quand il n'est pas renseigne. Avant, le filtre et les
   compteurs utilisaient le 12 pour tout le monde pendant que la couleur
   suivait le seuil du produit : deux verites a l'ecran. */
const LOW_STOCK = 12;
const seuilDe = (p: Product) => p.stock_alert ?? LOW_STOCK;

/** Prix payé par le client aujourd'hui : remise du produit, sinon de sa
 *  catégorie — la règle du checkout (lib/product-price), pas une copie. */
const prixEffectif = (p: Product) =>
  effectiveUnitPrice(Number(p.price) || 0, resolveDiscount(p, p.categories));

/** Référence affichée : la base n'a pas de champ SKU, on la dérive du sort_order. */
/* Reference stable, colonne `sku` (migration 036). Le repli sur
   sort_order ne sert qu'aux bases ou la migration n'est pas passee :
   une reference derivee de l'ordre d'affichage change des qu'on
   reordonne le catalogue. */
const refOf = (p: any) =>
  p.sku || (p.sort_order ? `SC-${String(p.sort_order).padStart(4, '0')}` : String(p.id).slice(0, 6).toUpperCase());

/* Marge = (prix encaissé − PA) / prix encaissé : la même que sur la fiche
   produit. L'ancienne formule retirait d'abord une TVA de 5,5 % que la
   boutique ne facture pas (franchise en base, art. 293 B du CGI), et
   ignorait les promos : la liste et la fiche affichaient deux marges. */
const marginPct = (p: Product) => {
  const pv = prixEffectif(p);
  const c = Number(p.cost_price) || 0;
  if (!pv || !c) return null;
  return Math.round(((pv - c) / pv) * 100);
};

export default function ProduitsPage() {
  const { t, tc, lang } = useT(TPR);
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
  /* Structure seulement (cartes au lieu du tableau, caméra auto) : le
     squelette de chargement, lui, est basculé en CSS. */
  const mobile = useIsMobile();
  const [showCosts, setShowCosts] = useState(true);
  const [priceModal, setPriceModal] = useState(false);
  const [pricePct, setPricePct] = useState('');

  /* Téléphone : actions secondaires dans « ⋯ », sélection groupée par un
     mode « Sélectionner » (pas de cases à cocher permanentes), actions
     d'un produit dans une feuille du bas. */
  const headMenuBtn = useRef<HTMLButtonElement>(null);
  const [headMenu, setHeadMenu] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [menuFor, setMenuFor] = useState<Product | null>(null);

  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get('q');
    if (initial) setQ(initial);
    load();
    // Recherche lancée depuis la topbar alors que la liste est déjà ouverte.
    const onSearch = (e: Event) => setQ(String((e as CustomEvent).detail || ''));
    window.addEventListener(ADMIN_SEARCH_EVENT, onSearch);
    return () => window.removeEventListener(ADMIN_SEARCH_EVENT, onSearch);
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
  /* Chaque écriture est vérifiée : avant, l'écran annonçait « N produits
     dépubliés / supprimés / prix ajustés » sans regarder les réponses.
     Seuls les produits réellement modifiés changent à l'écran ; ceux en
     échec restent sélectionnés pour réessayer. */
  async function surChacun(ids: string[], appel: (id: string) => Promise<Response>) {
    const oks = await Promise.all(ids.map(id => appel(id).then(r => r.ok).catch(() => false)));
    return { ok: ids.filter((_, i) => oks[i]), ko: ids.filter((_, i) => !oks[i]) };
  }
  const bilan = (ok: number, ko: number, verbe: string) =>
    ko ? `${ok} produit(s) ${verbe}, ${ko} en échec — réessaie` : `${ok} produit(s) ${verbe}`;

  async function bulkUnpublish() {
    if (!sel.size) return;
    setBusy(true);
    try {
      const { ok, ko } = await surChacun(Array.from(sel), id =>
        adminFetch(`/api/products/${id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_active: false }),
        }));
      setProducts(ps => ps.map(p => ok.includes(p.id) ? { ...p, is_active: false } : p));
      say(bilan(ok.length, ko.length, 'dépublié(s)'));
      setSel(new Set(ko));
    } finally { setBusy(false); }
  }

  async function bulkDelete() {
    if (!sel.size) return;
    if (!window.confirm(`Supprimer définitivement ${sel.size} produit(s) ? Cette action est irréversible.`)) return;
    setBusy(true);
    try {
      const { ok, ko } = await surChacun(Array.from(sel), id => adminFetch(`/api/products/${id}`, { method: 'DELETE' }));
      setProducts(ps => ps.filter(p => !ok.includes(p.id)));
      say(bilan(ok.length, ko.length, 'supprimé(s)'));
      setSel(new Set(ko));
    } finally { setBusy(false); }
  }

  async function bulkPrice() {
    const pct = parseFloat(pricePct.replace(',', '.'));
    if (!pct || Number.isNaN(pct)) { say(t('msgPourcent')); return; }
    // −100 % ou moins : prix nul ou négatif, refusé par la fiche.
    if (pct <= -100) { say('Une baisse de 100 % ou plus mettrait les prix à 0 €.'); return; }
    const nouveau = (prix: number) => Math.round((Number(prix) || 0) * (1 + pct / 100) * 100) / 100;
    setBusy(true);
    try {
      const targets = products.filter(p => sel.has(p.id));
      const { ok, ko } = await surChacun(targets.map(p => p.id), id => {
        const p = targets.find(x => x.id === id)!;
        /* Les variantes suivent : sinon « +5 % » montait le prix affiché
           mais pas celui du 250 g que le client met au panier. */
        const variantes = (p.product_variants || []).slice()
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
          .map(v => ({ label: v.label, price: nouveau(v.price) }));
        return adminFetch(`/api/products/${id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(variantes.length ? { price: nouveau(p.price), variants: variantes } : { price: nouveau(p.price) }),
        });
      });
      setProducts(ps => ps.map(p => ok.includes(p.id)
        ? { ...p, price: nouveau(p.price), product_variants: (p.product_variants || []).map(v => ({ ...v, price: nouveau(v.price) })) } : p));
      say(ko.length ? bilan(ok.length, ko.length, 'mis à jour') : `Prix ajustés de ${pct > 0 ? '+' : ''}${pct} % sur ${ok.length} produit(s)`);
      if (!ko.length) { setPriceModal(false); setPricePct(''); }
      setSel(new Set(ko));
    } finally { setBusy(false); }
  }

  async function duplicate(p: Product) {
    setBusy(true);
    try {
      /* Copie de la FICHE, pas de la ligne de liste : sans catégorie
         embarquée ni variantes brutes (colonnes inconnues → refus), sans
         EAN ni référence (uniques → refus), sans stock (la copie n'a
         encore rien en rayon). L'écran annonçait l'échec à chaque fois. */
      const {
        id: _id, categories: _c, product_variants, lot_disponible: _l, created_at: _ca, updated_at: _u,
        ean: _e, sku: _s, stock: _st, ...rest
      } = p as any;
      const variants = (product_variants || []).slice()
        .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((v: any) => ({ label: v.label, price: v.price }));
      const res = await adminFetch('/api/products', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...rest, variants, name_fr: `${p.name_fr} (copie)`, is_active: false }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || '');
      }
      say(t('msgDuplique'));
      load();
    } catch (e: any) { say(e?.message ? `${t('msgDupliqueKo')} ${e.message}` : t('msgDupliqueKo')); }
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

  /** Publier / dépublier un produit (ligne du tableau et menu mobile). */
  async function togglePublish(p: Product) {
    const res = await adminFetch(`/api/products/${p.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !p.is_active }),
    }).catch(() => null);
    // Échec : l'écran garde l'état réel au lieu d'afficher « publié ».
    if (!res || !res.ok) { say('Modification non enregistrée — réessaie'); return; }
    setProducts(ps => ps.map(x => x.id === p.id ? { ...x, is_active: !p.is_active } : x));
    say(p.is_active ? 'Produit masqué' : 'Produit publié');
  }

  const quitSelect = () => { setSelectMode(false); setSel(new Set()); };

  /* Téléphone (< 900 px) : le titre et ses actions défilent, la barre de
     recherche + filtres reste collée en haut. L'en-tête d'ordinateur est
     un seul bloc collant ; sur téléphone il passe en display: contents
     pour que seule la barre de filtres colle. */
  const css = `
    .pr-search { flex: 1 1 220px; max-width: 320px; background: #F7F4EF; }
    .pr-status { display: contents; }
    .pr-scan-body { padding: 15px; max-width: 300px; }
    .pr-card { display: flex; align-items: stretch; padding: 0; overflow: hidden; }
    .pr-card-main { flex: 1; min-width: 0; display: flex; align-items: center; gap: 12px; padding: 12px 0 12px 12px; text-decoration: none; background: none; border: none; text-align: left; font: inherit; color: inherit; cursor: pointer; }
    .pr-card-name { font-size: 14.5px; font-weight: 500; color: ${T.ink}; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
    .pr-card-meta { font-size: 12px; color: ${T.muted}; margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .pr-card-more { width: 48px; flex-shrink: 0; border: none; background: none; color: ${T.muted}; display: flex; align-items: center; justify-content: center; cursor: pointer; }
    .pr-check { width: 26px; height: 26px; border-radius: 7px; border: 2px solid ${T.borderField}; display: flex; align-items: center; justify-content: center; flex-shrink: 0; background: #fff; color: #fff; }
    .pr-card.on { border-color: var(--accent); box-shadow: inset 3px 0 0 var(--accent); }
    .pr-card.on .pr-check { background: var(--accent); border-color: var(--accent); }
    @media (min-width: 900px) { .pr-search { height: 32px; } }
    @media (max-width: 899px) {
      .pr-head.sc-page-head { display: contents; }
      .pr-top { margin-bottom: 10px !important; }
      .pr-top .sc-actions { flex-wrap: nowrap; }
      .pr-top .sc-actions > .sc-btn { flex: 0 0 auto; }
      .pr-top .sc-actions > .sc-btn-primary { flex: 1 1 auto; }
      .pr-filters { position: sticky; top: 0; z-index: 20; background: #fff; margin: 0 -12px 12px; padding: 8px 12px; border-bottom: 1px solid ${T.border}; border-top: 1px solid ${T.border}; gap: 8px !important; }
      .pr-search { flex: 1 1 0; min-width: 0; max-width: none; }
      .pr-cat { flex: 0 0 38%; min-width: 0; }
      .pr-status { display: flex; gap: 6px; flex: 1 1 100%; overflow-x: auto; margin: 0 -12px; padding: 0 12px; scrollbar-width: none; }
      .pr-status::-webkit-scrollbar { display: none; }
      .pr-status > .sc-chip { flex-shrink: 0; }
      .pr-scan-body { max-width: none; padding: 0 12px 12px; }
    }
  `;

  const scanLabel = 'Scanne l’article';

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />

      {/* ── En-tête collant ─────────────────────────────── */}
      <div className="sc-page-head pr-head">
        <div className="sc-head pr-top" style={{ marginBottom: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div className="sc-title">{t('titre')}</div>
            <div className="sc-sub">
              {filtered.length} produit{filtered.length > 1 ? 's' : ''}
              {filtered.length !== products.length ? ` sur ${products.length}` : ''}
              {lowCount > 0 ? ` · ${lowCount} sous le seuil` : ''}
            </div>
          </div>
          <div className="sc-actions">
            <button className="sc-btn sc-btn-secondary sc-hide-mobile" onClick={rehost} disabled={busy} title={t('imagesTitre')}>
              <span className="ms">cloud_upload</span>{t('images')}
            </button>
            <button className="sc-btn" onClick={() => setScanOpen(v => !v)} aria-label={t('creerScan')}
                    style={{ background: '#F3EDF3', color: '#6E4470', border: '1px solid #E3D6E3' }}>
              <span className="ms">barcode_scanner</span><span className="sc-hide-mobile">{t('creerScan')}</span>
            </button>
            <Link href="/admin/import" className="sc-btn sc-btn-secondary sc-hide-mobile"><span className="ms">upload</span>{t('importer')}</Link>
            {/* Téléphone : Images, Importer, coûts et sélection passent ici */}
            <button ref={headMenuBtn} className="sc-btn sc-btn-secondary sc-only-mobile-flex" onClick={() => setHeadMenu(true)}
                    aria-label="Plus d’actions" aria-haspopup="menu" aria-expanded={headMenu}>
              <span className="ms">more_horiz</span>
            </button>
            <Link href="/admin/produits/nouveau" className="sc-btn sc-btn-primary"><span className="ms">add</span>{t('nouveau')}</Link>
          </div>
        </div>

        {/* Creation par scan : carte sur ordinateur, plein écran sur téléphone */}
        {scanOpen && (
          <div className="sc-card sc-scan-sheet" style={{ border: '1px solid #E3D6E3', marginBottom: 12, overflow: 'hidden' }}>
            <div className="sc-scan-sheet-head">
              <div className="sc-scan-sheet-title">
                {t('creerScanTitre')}
                <div className="sc-scan-sheet-sub">Si le code est déjà au catalogue, sa fiche s’ouvre au lieu de créer un doublon.</div>
              </div>
              <button type="button" onClick={() => setScanOpen(false)} aria-label={tc('close')}><span className="ms" style={{ fontSize: 26 }}>close</span></button>
            </div>
            <div className="sc-hide-mobile" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 15px', background: '#F9F5F9', flexWrap: 'wrap' }}>
              <span className="ms" style={{ fontSize: 19, color: '#6E4470' }}>barcode_scanner</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#5E3B5E' }}>{t('creerScanTitre')}</div>
                <div style={{ fontSize: 11, color: '#6E4470' }}>
                  Si le code est d&eacute;j&agrave; au catalogue, sa fiche s&rsquo;ouvre au lieu de cr&eacute;er un doublon.
                </div>
              </div>
              <button className="sc-btn sc-btn-secondary" style={{ padding: '5px 10px', fontSize: 11 }} onClick={() => setScanOpen(false)}>{tc('close')}</button>
            </div>
            <div className="pr-scan-body">
              <BarcodeScanner compact label={scanLabel} autoStart={mobile}
                              onScan={code => router.push(`/admin/produits/nouveau?ean=${encodeURIComponent(code)}`)} />
            </div>
          </div>
        )}

        {/* Filtres */}
        <div className="pr-filters" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            className="sc-input pr-search"
            type="search"
            enterKeyHint="search"
            placeholder={t('chercher')}
            value={q}
            onChange={e => setQ(e.target.value)}
          />
          {/* Téléphone : une liste déroulante plutôt que 20 puces sur 8 lignes */}
          <select className="sc-select pr-cat sc-only-mobile" value={cat} onChange={e => setCat(e.target.value)} aria-label={t('categorie')}>
            <option value="">{t('toutes')}</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name_fr}</option>)}
          </select>
          <button className={`sc-chip sc-hide-mobile${cat === '' ? ' on' : ''}`} onClick={() => setCat('')}>{t('toutes')}</button>
          {categories.map(c => (
            <button key={c.id} className={`sc-chip sc-hide-mobile${cat === c.id ? ' on' : ''}`} onClick={() => setCat(c.id)}>{c.name_fr}</button>
          ))}
          <span className="sc-hide-mobile" style={{ flex: 1 }} />
          <div className="pr-status">
            {[['', 'Tous'], ['active', 'Actifs'], ['low', 'Stock bas'], ['draft', 'Brouillons']].map(([v, l]) => (
              <button key={v} className={`sc-chip${stat === v ? ' on' : ''}`} onClick={() => setStat(v)}>{l}</button>
            ))}
          </div>
          <button className="sc-chip sc-hide-mobile" onClick={() => setShowCosts(v => !v)} title={t('voirMarge')}>
            <span className="ms" style={{ fontSize: 16 }}>{showCosts ? 'visibility_off' : 'visibility'}</span>
            {showCosts ? 'Masquer coûts' : 'Afficher coûts'}
          </button>
        </div>

        {/* Barre de sélection groupée (ordinateur ; téléphone : en bas) */}
        {sel.size > 0 && (
          <div className="sc-hide-mobile" style={{
            display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
            background: '#F3EDF3', border: '1px solid #E3D6E3', borderRadius: 8,
            padding: '8px 12px', marginTop: 10,
          }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: '#6E4470' }}>
              {sel.size} produit{sel.size > 1 ? 's' : ''} sélectionné{sel.size > 1 ? 's' : ''}
            </span>
            <span style={{ flex: 1 }} />
            <button className="sc-btn sc-btn-secondary" onClick={() => setPriceModal(true)} disabled={busy}>
              <span className="ms">sell</span>{t('modifierPrix')}
            </button>
            <button className="sc-btn sc-btn-secondary" onClick={bulkUnpublish} disabled={busy}>
              <span className="ms">visibility_off</span>{t('depublier')}
            </button>
            <button className="sc-btn sc-btn-danger" onClick={bulkDelete} disabled={busy}>
              <span className="ms">delete</span>{tc('delete')}
            </button>
            <button className="sc-btn sc-btn-secondary" onClick={() => setSel(new Set())}>{tc('cancel')}</button>
          </div>
        )}
      </div>

      {/* ── Contenu ─────────────────────────────────────── */}
      {loading && (
        <>
          <div className="sc-hide-mobile"><SqueletteTable lignes={8} colonnes={5} vignette /></div>
          <div className="sc-only-mobile"><SqueletteListe n={7} /></div>
        </>
      )}
      {!loading && filtered.length === 0 && <div className="sc-empty">{t('aucun')}</div>}

      {/* Desktop : table */}
      {!loading && !mobile && filtered.length > 0 && (
        <div className="sc-card" style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="sc-table" style={{ minWidth: 760 }}>
              <thead>
                <tr>
                  <th style={{ width: 38 }}>
                    <input type="checkbox" checked={allChecked} onChange={toggleAll} aria-label={t('toutSelect')} />
                  </th>
                  <th style={{ width: 92 }}>Réf.</th>
                  <th>{tc('product')}</th>
                  <th style={{ width: 140 }}>{t('categorie')}</th>
                  <th className="sc-right" style={{ width: 84 }}>Prix</th>
                  {showCosts && <th className="sc-right" style={{ width: 84 }}>Coût</th>}
                  {showCosts && <th className="sc-right" style={{ width: 74 }}>{t('marge')}</th>}
                  <th style={{ width: 118 }}>{tc('stock')}</th>
                  <th style={{ width: 104 }}>{tc('status')}</th>
                  <th style={{ width: 96 }} />
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => {
                  const checked = sel.has(p.id);
                  const qty = p.stock ?? 0;
                  const thr = seuilDe(p);
                  const gaugeMax = Math.max(qty, thr * 4, 1);
                  const m = marginPct(p);
                  const st = statusOf(p);
                  return (
                    <tr key={p.id} style={checked ? { background: 'color-mix(in srgb, var(--accent) 4%, transparent)' } : undefined}>
                      <td><input type="checkbox" checked={checked} onChange={() => toggle(p.id)} aria-label={`${t('toutSelect')} — ${nomProduit(p, lang)}`} /></td>
                      <td className="sc-num" style={{ fontSize: 11.5, color: T.muted }}>{refOf(p)}</td>
                      <td>
                        <Link href={`/admin/produits/${p.id}`} style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
                          {p.image_url
                            ? <img src={p.image_url} alt="" style={thumbStyle(p.name_fr, 28)} />
                            : <div style={thumbStyle(p.name_fr, 28)}>{initials(p.name_fr, 1)}</div>}
                          <span style={{ fontSize: 13, fontWeight: 500, color: T.ink }}>{nomProduit(p, lang)}</span>
                        </Link>
                      </td>
                      <td>{catName(p.category_id)}</td>
                      <td className="sc-num sc-right">
                        {/* Promo en cours (produit ou catégorie) : prix barré + prix payé */}
                        {prixEffectif(p) < (Number(p.price) || 0)
                          ? <><s style={{ display: 'block', color: T.muted3, fontWeight: 400, fontSize: 11, whiteSpace: 'nowrap' }}>{eur(p.price)}</s><span style={{ color: T.red, whiteSpace: 'nowrap' }}>{eur(prixEffectif(p))}</span></>
                          : eur(p.price)}
                      </td>
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
                          <Link href={`/admin/produits/${p.id}`} className="sc-iconbtn" title={tc('edit')}><span className="ms">edit</span></Link>
                          <button className="sc-iconbtn" title={t('dupliquer')} onClick={() => duplicate(p)} disabled={busy}><span className="ms">content_copy</span></button>
                          <button
                            className="sc-iconbtn"
                            title={p.is_active ? t('depublier') : t('publier')}
                            onClick={() => togglePublish(p)}
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

      {/* Mobile : cartes. Nom sur deux lignes, statut, prix, stock, coût et
          marge si affichés ; « ⋮ » ouvre les actions du produit. En mode
          sélection, toucher une carte la coche. */}
      {!loading && mobile && filtered.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(p => {
            const st = statusOf(p);
            const on = sel.has(p.id);
            const m = marginPct(p);
            const body = (
              <>
                {selectMode && (
                  <span className="pr-check" aria-hidden="true">{on && <span className="ms" style={{ fontSize: 18 }}>check</span>}</span>
                )}
                {p.image_url
                  ? <img src={p.image_url} alt="" loading="lazy" style={thumbStyle(p.name_fr, 52)} />
                  : <div style={thumbStyle(p.name_fr, 52)}>{initials(p.name_fr, 1)}</div>}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="pr-card-name">{nomProduit(p, lang)}</div>
                  <div className="pr-card-meta">{refOf(p)} · {catName(p.category_id)}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5, flexWrap: 'wrap' }}>
                    {prixEffectif(p) < (Number(p.price) || 0) ? (
                      <span className="sc-num" style={{ fontSize: 15, fontWeight: 700, color: T.red }}>
                        <s style={{ color: T.muted3, fontWeight: 400, fontSize: 12.5, marginRight: 4 }}>{eur(p.price)}</s>{eur(prixEffectif(p))}
                      </span>
                    ) : (
                      <span className="sc-num" style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>{eur(p.price)}</span>
                    )}
                    <span className="sc-badge" style={{ background: BADGE[st.tone].bg, color: BADGE[st.tone].fg }}>{st.label}</span>
                    {p.track_stock && <span className="sc-num" style={{ fontSize: 12.5, color: stockColor(p.stock ?? 0, seuilDe(p)), fontWeight: 600 }}>{p.stock ?? 0} en stock</span>}
                  </div>
                  {showCosts && (p.cost_price || m != null) && (
                    <div className="sc-num" style={{ fontSize: 12, color: T.muted, marginTop: 3 }}>
                      Coût {p.cost_price ? eur(p.cost_price) : '—'}{m != null ? <> · marge <b style={{ color: T.green }}>{m} %</b></> : ''}
                    </div>
                  )}
                </div>
              </>
            );
            return (
              <div key={p.id} className={`sc-card pr-card${selectMode && on ? ' on' : ''}`}>
                {selectMode ? (
                  <button type="button" className="pr-card-main" onClick={() => toggle(p.id)} aria-pressed={on}>{body}</button>
                ) : (
                  <Link href={`/admin/produits/${p.id}`} className="pr-card-main">{body}</Link>
                )}
                {!selectMode && (
                  <button type="button" className="pr-card-more" onClick={() => setMenuFor(p)} aria-label={`Actions — ${nomProduit(p, lang)}`}>
                    <span className="ms" style={{ fontSize: 22 }}>more_vert</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Téléphone : barre de sélection collée en bas, au-dessus des onglets */}
      {mobile && selectMode && (
        <div className="sc-sticky-actions" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: T.ink }}>
              {sel.size} sélectionné{sel.size > 1 ? 's' : ''}
            </span>
            <button type="button" className="sc-chip" onClick={toggleAll}>{allChecked ? 'Aucun' : 'Tout'}</button>
            <button type="button" className="sc-chip" onClick={quitSelect}>Terminer</button>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="sc-btn sc-btn-secondary" style={{ flex: 1, justifyContent: 'center', padding: '10px 6px' }} onClick={() => setPriceModal(true)} disabled={busy || !sel.size}>
              <span className="ms">sell</span>Prix
            </button>
            <button className="sc-btn sc-btn-secondary" style={{ flex: 1, justifyContent: 'center', padding: '10px 6px' }} onClick={bulkUnpublish} disabled={busy || !sel.size}>
              <span className="ms">visibility_off</span>{t('depublier')}
            </button>
            <button className="sc-btn sc-btn-danger" style={{ flex: 1, justifyContent: 'center', padding: '10px 6px' }} onClick={bulkDelete} disabled={busy || !sel.size}>
              <span className="ms">delete</span>{tc('delete')}
            </button>
          </div>
        </div>
      )}

      {/* ── Menus (téléphone) ─────────────────────────────── */}
      <MenuActions open={headMenu} anchor={headMenuBtn.current} onClose={() => setHeadMenu(false)}>
        <MenuItem icon="checklist" label={selectMode ? 'Quitter la sélection' : 'Sélectionner des produits'}
                  hint="Modifier les prix, dépublier ou supprimer en groupe"
                  onClick={() => (selectMode ? quitSelect() : setSelectMode(true))} />
        <MenuItem icon={showCosts ? 'visibility_off' : 'visibility'} label={showCosts ? 'Masquer coûts et marges' : 'Afficher coûts et marges'}
                  onClick={() => setShowCosts(v => !v)} />
        <MenuSep />
        <MenuItem icon="upload" label={t('importer')} href="/admin/import" />
        <MenuItem icon="cloud_upload" label={t('images')} hint={t('imagesTitre')} onClick={rehost} disabled={busy} />
      </MenuActions>

      <MenuActions open={!!menuFor} onClose={() => setMenuFor(null)} title={menuFor ? nomProduit(menuFor, lang) : ''}>
        {menuFor && (
          <>
            <MenuItem icon="edit" label={tc('edit')} href={`/admin/produits/${menuFor.id}`} />
            <MenuItem icon="content_copy" label={t('dupliquer')} onClick={() => duplicate(menuFor)} disabled={busy} />
            <MenuItem icon={menuFor.is_active ? 'visibility_off' : 'visibility'}
                      label={menuFor.is_active ? t('depublier') : t('publier')}
                      onClick={() => togglePublish(menuFor)} />
            <MenuItem icon="checklist" label="Sélectionner" onClick={() => { setSelectMode(true); setSel(new Set([menuFor.id])); }} />
          </>
        )}
      </MenuActions>

      {/* ── Modale « Modifier les prix » ─────────────────── */}
      {priceModal && (
        <div className="sc-modal-back" onClick={e => { if (e.target === e.currentTarget) setPriceModal(false); }}>
          <div className="sc-modal" role="dialog" aria-modal="true" aria-label={t('modifierPrix')} style={{ maxWidth: 380 }}>
            <div className="sc-modal-head">
              <span className="sc-card-title">{t('modifierPrix')}</span>
              <button type="button" className="sc-iconbtn" onClick={() => setPriceModal(false)} aria-label={tc('close')}><span className="ms">close</span></button>
            </div>
            <div className="sc-modal-body">
              <div style={{ fontSize: 12.5, color: T.text3, marginBottom: 14 }}>
                Appliqué aux {sel.size} produit(s) sélectionné(s). Un nombre négatif baisse les prix.
              </div>
              <label className="sc-label">{t('variation')}</label>
              <input className="sc-input" autoFocus value={pricePct} placeholder="ex. 5 ou -3"
                     onChange={e => setPricePct(e.target.value)}
                     onKeyDown={e => { if (e.key === 'Enter') bulkPrice(); }} />
            </div>
            <div className="sc-modal-foot">
              <button className="sc-btn sc-btn-secondary" onClick={() => setPriceModal(false)}>{tc('cancel')}</button>
              <button className="sc-btn sc-btn-primary" onClick={bulkPrice} disabled={busy}>{t('appliquer')}</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="sc-toast" role="status">{toast}</div>}
    </>
  );
}
