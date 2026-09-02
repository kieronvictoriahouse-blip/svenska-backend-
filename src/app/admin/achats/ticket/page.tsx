'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { adminFetch } from '@/lib/auth-client';
import { T, BADGE, thumbStyle, initials } from '@/lib/admin-theme';
import { nomProduit, useT } from '@/lib/admin-i18n';
import { TTI, lignesLues, commandeCreee, ecartPrix } from './i18n';

/* ═══════════════════════════════════════════════════════════════
   ACHATS › SAISIE TICKET DE CAISSE
   Handoff v2 §1. Deux modes : photo du ticket (OCR) et saisie rapide.
   Les prix du ticket sont TTC en couronnes : moms déduite puis
   conversion en euros HT. Le PA HT unitaire alimente la fiche produit.
   ═══════════════════════════════════════════════════════════════ */

type Status = 'matched' | 'review' | 'new' | 'ignored' | 'validated';

type Line = {
  key: string;
  raw_label: string;
  product_id: string | null;
  product_name: string | null;
  qty: number;
  unit_sek: number;
  status: Status;
  score?: number;
  candidates?: Array<{ id: string; name: string; score: number }>;
  ignored?: boolean;
};

type Product = {
  id: string; name_fr: string; name_sv?: string; image_url?: string;
  cost_price?: number; category_id?: string; sort_order?: number; ean?: string;
};

/* Pays du ticket : la Suède convertit SEK→EUR et déduit la moms ;
   la France est déjà en euros, TVA française, sans conversion. */
type Country = 'SE' | 'FR';
const COUNTRY: Record<Country, {
  label: string; flag: string; currency: string; symbol: string;
  defaultRate: string; fixedRate: boolean; vatLabel: string;
  stores: string[]; vats: Array<{ value: string; label: string }>;
}> = {
  SE: {
    label: 'Suède', flag: '🇸🇪', currency: 'SEK', symbol: 'kr',
    defaultRate: '0,0876', fixedRate: false, vatLabel: 'Moms (TVA suédoise)',
    stores: ['ICA Maxi · Malmö', 'Willys · Helsingborg', 'Coop · Göteborg', 'Systembolaget'],
    vats: [{ value: '12', label: 'Alimentaire 12 %' }, { value: '25', label: 'Standard 25 %' }],
  },
  FR: {
    label: 'France', flag: '🇫🇷', currency: 'EUR', symbol: '€',
    defaultRate: '1', fixedRate: true, vatLabel: 'TVA française',
    stores: ['Carrefour', 'E.Leclerc', 'Auchan', 'Intermarché', 'Système U', 'Metro / grossiste', 'Autre'],
    vats: [{ value: '5.5', label: 'Alimentaire 5,5 %' }, { value: '10', label: 'Restauration 10 %' }, { value: '20', label: 'Standard 20 %' }],
  },
};

const uid = () => Math.random().toString(36).slice(2, 9);

const money = (n: number, sym: string) => (Number(n) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + sym;
const eur = (n: number) => money(n, '€');
const isPdf = (url: string) => /\.pdf($|\?)/i.test(url || '');

const STATUS_META: Record<Status, { border: string; label: string; tone: keyof typeof BADGE }> = {
  matched:   { border: '#3E5238', label: 'Rapproché',      tone: 'green'  },
  review:    { border: '#C97A2B', label: 'À vérifier',     tone: 'amber'  },
  new:       { border: '#1C4E80', label: 'Nouveau produit', tone: 'blue'   },
  ignored:   { border: '#B5AC9C', label: 'Ignorée',        tone: 'gray'   },
  validated: { border: '#3E5238', label: 'Validée',        tone: 'green'  },
};

export default function TicketPage() {
  const { t, tc, lang } = useT(TTI);
  const [mode, setMode] = useState<'photo' | 'quick'>('photo');
  const [country, setCountry] = useState<Country>('SE');
  const cfg = COUNTRY[country];
  const [store, setStore] = useState(COUNTRY.SE.stores[0]);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [rate, setRate] = useState('0,0876');
  const [vat, setVat] = useState('12');
  const [totalOcr, setTotalOcr] = useState('');

  const cur = (n: number) => money(n, cfg.symbol);

  /** Bascule Suède ⇄ France : réaligne devise, taux, TVA et magasin. */
  function switchCountry(c: Country) {
    const next = COUNTRY[c];
    setCountry(c);
    setRate(next.defaultRate);
    setVat(next.vats[0].value);
    setStore(next.stores[0]);
  }

  const [lines, setLines] = useState<Line[]>([]);
  const [images, setImages] = useState<string[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [busy, setBusy] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [toast, setToast] = useState('');
  const cameraRef = useRef<HTMLInputElement>(null); // appareil photo (capture)
  const fileRef = useRef<HTMLInputElement>(null);   // import PDF ou image

  // Saisie rapide
  const [qName, setQName] = useState('');
  const [qQty, setQQty] = useState('1');
  const [qPrice, setQPrice] = useState('');
  const [qPick, setQPick] = useState<Product | null>(null);
  const [sugOpen, setSugOpen] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 4000); };
  const rateNum = parseFloat(rate.replace(',', '.')) || 0;
  const vatNum = parseFloat(vat) || 0;

  useEffect(() => {
    adminFetch('/api/products?limit=1000').then(r => r.json())
      .then(d => setProducts(d.products || [])).catch(() => {});
  }, []);

  /* ── Calculs du handoff ─────────────────────────────────── */
  const lineSek = (l: Line) => (Number(l.qty) || 0) * (Number(l.unit_sek) || 0);
  const toEurHt = (sek: number) => vatNum >= 0 ? (sek / (1 + vatNum / 100)) * rateNum : 0;
  const lineEur = (l: Line) => toEurHt(lineSek(l));
  const unitEur = (l: Line) => toEurHt(Number(l.unit_sek) || 0);

  const totalLines = useMemo(() => lines.reduce((s, l) => s + lineSek(l), 0), [lines, rateNum, vatNum]);
  const goodsSek = useMemo(() => lines.filter(l => !l.ignored && l.status !== 'ignored').reduce((s, l) => s + lineSek(l), 0), [lines]);
  const goodsEur = toEurHt(goodsSek);
  const ocrNum = parseFloat(totalOcr.replace(',', '.')) || 0;
  const gap = totalLines - ocrNum;
  const gapOk = !ocrNum || Math.abs(gap) < 0.01;

  const toReview = lines.filter(l => l.status === 'review').length;
  const isNew = lines.filter(l => l.status === 'new').length;
  const validated = lines.filter(l => l.status === 'validated').length;

  /* ── Photo / fichier & OCR ──────────────────────────────── */
  async function uploadFiles(files: FileList | null) {
    if (!files?.length) return;
    setOcrBusy(true);
    const token = localStorage.getItem('sd_admin_token');
    const urls: string[] = [];
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('folder', 'tickets');      // justificatif comptable, conservé dans Supabase
        const res = await adminFetch('/api/upload', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
        const d = await res.json();
        if (d.url) urls.push(d.url);
      }
      if (!urls.length) { say(t('msgPhotoKo')); return; }
      setImages(prev => [...prev, ...urls]);

      // Lecture OCR — l'endpoint indique clairement s'il n'est pas configuré.
      const r = await adminFetch('/api/tickets/ocr', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_urls: urls, store, lang: country === 'FR' ? 'fre' : 'swe' }),
      });
      const d = await r.json();
      if (!r.ok || d.unavailable) {
        say(d.error || 'OCR non configuré — utilise la saisie rapide, ou ajoute une clé OCR.');
        return;
      }
      if (d.total_ocr) setTotalOcr(String(d.total_ocr).replace('.', ','));
      if (Array.isArray(d.lines) && d.lines.length) {
        await addRawLines(d.lines.map((l: any) => ({
          raw_label: l.label, qty: Number(l.qty) || 1, unit_sek: Number(l.unit_price) || 0,
        })));
        say(lignesLues(d.lines.length, lang));
      }
    } catch (e: any) {
      say(e?.message || 'Lecture du ticket impossible');
    } finally { setOcrBusy(false); }
  }

  /** Rapproche des libellés bruts au catalogue puis les ajoute. */
  async function addRawLines(raw: Array<{ raw_label: string; qty: number; unit_sek: number }>) {
    let matches: any[] = [];
    try {
      const q = encodeURIComponent(raw.map(r => r.raw_label).join('|'));
      const d = await adminFetch(`/api/tickets?labels=${q}&store=${encodeURIComponent(store)}`).then(r => r.json());
      matches = d.results || [];
    } catch { /* sans rapprochement, tout arrive en « nouveau produit » */ }

    setLines(prev => [...prev, ...raw.map((r, i) => {
      const m = matches[i] || {};
      return {
        key: uid(),
        raw_label: r.raw_label,
        product_id: m.product_id || null,
        product_name: m.product_name || null,
        qty: r.qty,
        unit_sek: r.unit_sek,
        status: (m.status || 'new') as Status,
        score: m.score,
        candidates: m.candidates || [],
        ignored: m.status === 'ignored',
      };
    })]);
  }

  /* ── Édition des lignes ─────────────────────────────────── */
  const patch = (key: string, p: Partial<Line>) =>
    setLines(ls => ls.map(l => l.key === key ? { ...l, ...p } : l));

  const toggleValid = (l: Line) =>
    patch(l.key, { status: l.status === 'validated' ? (l.product_id ? 'matched' : 'new') : 'validated' });

  const validateAll = () =>
    setLines(ls => ls.map(l => l.ignored || l.status === 'ignored' ? l : { ...l, status: 'validated' }));

  /* ── Saisie rapide ──────────────────────────────────────── */
  const suggestions = useMemo(() => {
    const q = qName.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter(p => (p.name_fr || '').toLowerCase().includes(q) || (p.name_sv || '').toLowerCase().includes(q))
      .slice(0, 5);
  }, [qName, products]);

  function pickSuggestion(p: Product) {
    setQPick(p);
    setQName(p.name_fr);
    setSugOpen(false);
    // Pré-remplit le prix depuis le dernier PA connu, reconverti en couronnes.
    if (p.cost_price && rateNum > 0 && !qPrice) {
      const sek = (p.cost_price / rateNum) * (1 + vatNum / 100);
      setQPrice(String(Math.round(sek * 100) / 100).replace('.', ','));
    }
  }

  function addQuickLine() {
    const name = qName.trim();
    const price = parseFloat(qPrice.replace(',', '.')) || 0;
    const qty = parseInt(qQty) || 1;
    if (!name || !price) { say(t('msgNomPrix')); return; }

    // Garde-fou du handoff : écart de plus de 15 % avec le dernier PA connu.
    if (qPick?.cost_price && rateNum > 0) {
      const newPa = (price / (1 + vatNum / 100)) * rateNum;
      const drift = Math.abs(newPa - qPick.cost_price) / qPick.cost_price;
      if (drift > 0.15) {
        const ok = window.confirm(
          ecartPrix(eur(newPa), Math.round(drift * 100), lang)
          + `\n\n(${eur(qPick.cost_price)})`);
        if (!ok) return;
      }
    }

    setLines(ls => [...ls, {
      key: uid(), raw_label: name,
      product_id: qPick?.id || null, product_name: qPick?.name_fr || null,
      qty, unit_sek: price,
      status: qPick ? 'validated' : 'new',
    }]);
    setQName(''); setQQty('1'); setQPrice(''); setQPick(null);
    nameRef.current?.focus();
  }

  /* ── Enregistrement ─────────────────────────────────────── */
  async function submit(draft: boolean) {
    if (!lines.length) { say(t('msgAucuneLigne')); return; }
    if (!draft && !rateNum) { say(t('msgTaux')); return; }
    setBusy(true);
    try {
      const res = await adminFetch('/api/tickets', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store, purchased_at: date, exchange_rate: rateNum, vat_rate: vatNum,
          currency: cfg.currency, country,
          total_ocr: ocrNum || null, image_urls: images, draft,
          lines: lines.map(l => ({
            raw_label: l.raw_label, product_id: l.product_id, product_name: l.product_name,
            qty: l.qty, unit_sek: l.unit_sek, ignored: !!l.ignored || l.status === 'ignored',
          })),
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Erreur');
      if (draft) { say(t('msgBrouillon')); return; }
      say(commandeCreee(d.purchase_order?.number, d.warning || '', lang));
      setLines([]); setImages([]); setTotalOcr('');
    } catch (e: any) { say(e.message); }
    finally { setBusy(false); }
  }

  const cell: React.CSSProperties = { background: '#fff', padding: '9px 13px' };
  const cellLabel: React.CSSProperties = {
    fontSize: 8.5, letterSpacing: 1.4, textTransform: 'uppercase',
    color: T.muted, fontWeight: 600, marginBottom: 4,
  };

  return (
    <>
      <div className="sc-head">
        <div>
          <div className="sc-title">{t('titre')}</div>
          <div className="sc-sub">
            Photographie ou importe le ticket (PDF ou image) : les lignes sont lues, converties en euros et rapprochées de ton catalogue.
          </div>
        </div>
        <div className="sc-actions">
          <div style={{ display: 'flex', gap: 4 }}>
            {([['photo', 'Photo du ticket', 'photo_camera'], ['quick', 'Saisie rapide', 'keyboard']] as const).map(([k, l, ic]) => (
              <button key={k} onClick={() => setMode(k as any)}
                style={{
                  height: 34, padding: '0 13px', borderRadius: 8, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5,
                  border: `1px solid ${mode === k ? T.ink : T.borderField}`,
                  background: mode === k ? T.ink : '#fff',
                  color: mode === k ? '#fff' : T.text2,
                  fontWeight: mode === k ? 600 : 400,
                }}>
                <span className="ms" style={{ fontSize: 17 }}>{ic}</span>{l}
              </button>
            ))}
          </div>
          <a className="sc-btn sc-btn-secondary" href="/admin/achats"><span className="ms">arrow_back</span>{t('achats')}</a>
        </div>
      </div>

      {/* ── Bandeau de contexte ─────────────────────────── */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 1,
        background: T.border, border: `1px solid ${T.border}`, borderRadius: 10,
        overflow: 'hidden', marginBottom: 12,
      }}>
        <div style={cell}>
          <div style={cellLabel}>{t('pays')}</div>
          <select className="sc-input sc-select" style={{ height: 30 }} value={country}
                  onChange={e => switchCountry(e.target.value as Country)}>
            {(Object.keys(COUNTRY) as Country[]).map(c => (
              <option key={c} value={c}>{COUNTRY[c].flag} {COUNTRY[c].label}</option>
            ))}
          </select>
        </div>
        <div style={cell}>
          <div style={cellLabel}>{t('magasin')}</div>
          <select className="sc-input sc-select" style={{ height: 30 }} value={store} onChange={e => setStore(e.target.value)}>
            {cfg.stores.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div style={cell}>
          <div style={cellLabel}>{t('dateAchat')}</div>
          <input className="sc-input" type="date" style={{ height: 30 }} value={date} onChange={e => setDate(e.target.value)} />
        </div>
        {cfg.fixedRate ? (
          <div style={cell}>
            <div style={cellLabel}>{t('devise')}</div>
            <div style={{ height: 30, display: 'flex', alignItems: 'center', fontSize: 12.5, color: T.text2b }}>
              {cfg.currency} · {t('sansConversion')}
            </div>
          </div>
        ) : (
          <div style={cell}>
            <div style={cellLabel}>{t('taux')}</div>
            <input className="sc-input sc-num" style={{ height: 30 }} value={rate} onChange={e => setRate(e.target.value)} placeholder={cfg.defaultRate} />
          </div>
        )}
        <div style={cell}>
          <div style={cellLabel}>{cfg.vatLabel}</div>
          <select className="sc-input sc-select" style={{ height: 30 }} value={vat} onChange={e => setVat(e.target.value)}>
            {cfg.vats.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
          </select>
        </div>
      </div>

      {/* ══════════ MODE PHOTO ══════════ */}
      {mode === 'photo' && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>

          {/* Colonne gauche */}
          <div style={{ flex: '1 1 280px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="sc-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 15px', borderBottom: `1px solid ${T.border}` }}>
                <span className="ms" style={{ fontSize: 18, color: 'var(--accent)' }}>receipt_long</span>
                <span className="sc-card-title">Ticket {store.split(' · ')[0]}</span>
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 10.5, color: T.muted }}>{new Date(date).toLocaleDateString('fr-FR')}</span>
              </div>
              <div style={{ padding: 15 }}>
                <div style={{
                  position: 'relative', aspectRatio: '3 / 4', borderRadius: 8, overflow: 'hidden',
                  border: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: images[0] && !isPdf(images[0])
                    ? `center/cover url(${images[0]})`
                    : 'repeating-linear-gradient(45deg,#F7F4EF 0 6px,#F1EDE7 6px 12px)',
                }}>
                  {images[0] && isPdf(images[0]) && (
                    <a href={images[0]} target="_blank" rel="noreferrer"
                       style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textDecoration: 'none', color: T.text2b }}>
                      <span className="ms" style={{ fontSize: 46, color: '#B23B3B' }}>picture_as_pdf</span>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{t('justificatif')}</span>
                      <span style={{ fontSize: 10.5, color: 'var(--accent)' }}>{t('ouvrirPdf')} ↗</span>
                    </a>
                  )}
                  {lines.length > 0 && (
                    <span style={{
                      position: 'absolute', bottom: 8, left: 8, background: 'rgba(28,32,40,.82)', color: '#fff',
                      fontSize: 10.5, fontWeight: 600, padding: '3px 8px', borderRadius: 20,
                    }}>{lines.length} lignes lues</span>
                  )}
                  {images.length > 1 && (
                    <span style={{
                      position: 'absolute', top: 8, right: 8, background: 'rgba(28,32,40,.82)', color: '#fff',
                      fontSize: 10.5, fontWeight: 600, padding: '3px 8px', borderRadius: 20,
                    }}>{images.length} pages</span>
                  )}
                </div>

                {/* Appareil photo — prise directe, ouvre la caméra sur mobile. */}
                <button className="sc-btn sc-btn-secondary" style={{ width: '100%', justifyContent: 'center', marginTop: 10 }}
                        onClick={() => { setImages([]); setLines([]); cameraRef.current?.click(); }} disabled={ocrBusy}>
                  <span className="ms">photo_camera</span>{ocrBusy ? t('lecture') : images.length ? t('reprendre') : t('prendrePhoto')}
                </button>

                {/* Import — PDF ou image depuis l'appareil (galerie, fichiers). */}
                <button className="sc-btn sc-btn-secondary" style={{ width: '100%', justifyContent: 'center', marginTop: 6 }}
                        onClick={() => fileRef.current?.click()} disabled={ocrBusy}>
                  <span className="ms">upload_file</span>{images.length ? t('pageSuppl') : t('importerFichier')}
                </button>

                {/* Deux entrées distinctes : la caméra force capture, l'import laisse
                    choisir un PDF ou une image existante. */}
                <input ref={cameraRef} type="file" accept="image/*" capture="environment"
                       style={{ display: 'none' }} onChange={e => { uploadFiles(e.target.files); e.target.value = ''; }} />
                <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple
                       style={{ display: 'none' }} onChange={e => { uploadFiles(e.target.files); e.target.value = ''; }} />
              </div>
            </div>

            {/* Contrôle du ticket */}
            <div className="sc-card">
              <div style={{ padding: '12px 15px', borderBottom: `1px solid ${T.border}` }}>
                <span className="sc-card-title">{t('controle')}</span>
              </div>
              <div style={{ padding: '13px 15px' }}>
                <div style={{ marginBottom: 10 }}>
                  <label className="sc-label">{t('totalLu')}</label>
                  <input className="sc-input sc-num" value={totalOcr} onChange={e => setTotalOcr(e.target.value)}
                         placeholder="1 526,80" />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: T.text2b, padding: '5px 0' }}>
                  <span>{t('totalSaisi')}</span>
                  <span className="sc-num">{cur(totalLines)}</span>
                </div>

                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, padding: '9px 12px', borderRadius: 8,
                  background: gapOk ? '#F1F6EF' : '#FDF6EA',
                  border: `1px solid ${gapOk ? '#CFE0C8' : '#E8CFA8'}`,
                  color: gapOk ? '#3E5238' : '#8A5B08',
                }}>
                  <span className="ms" style={{ fontSize: 17 }}>{gapOk ? 'check_circle' : 'warning'}</span>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>
                    {!ocrNum ? 'Renseigne le total du ticket pour contrôler'
                      : gapOk ? 'Total conforme'
                      : `Écart ${gap > 0 ? '+' : '−'} ${cur(Math.abs(gap))}`}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 12, paddingTop: 10, borderTop: `1px solid ${T.borderFaint}` }}>
                  <span style={{ fontSize: 12, color: T.text2b }}>{t('marchandises')}</span>
                  <span className="sc-num" style={{ fontSize: 15, fontWeight: 700, color: T.green }}>{eur(goodsEur)}</span>
                </div>
                <div style={{ fontSize: 10.5, color: T.muted, marginTop: 6, lineHeight: 1.5 }}>
                  Prix relevés TTC · {country === 'FR' ? 'TVA' : 'moms'} {vat.replace('.', ',')} % déduite
                  {country === 'FR' ? '' : ' puis conversion en euros'} pour obtenir le prix d’achat.
                </div>
              </div>
            </div>

            {/* Apprentissage */}
            <div style={{ background: '#F3EDF3', border: '1px solid #E3D6E3', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#5E3B5E' }}>
                {lines.length} ligne(s) · {validated} validée(s)
              </div>
              <div style={{ fontSize: 11, color: '#6E4470', marginTop: 5, lineHeight: 1.55 }}>
                Chaque correction est mémorisée : un libellé validé à la main sera reconnu
                automatiquement au prochain ticket du même magasin.
              </div>
            </div>
          </div>

          {/* Colonne droite — lignes */}
          <div style={{ flex: '2 1 500px', minWidth: 0 }}>
            <div className="sc-card" style={{ overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 15px', borderBottom: `1px solid ${T.border}`, flexWrap: 'wrap' }}>
                <div>
                  <span className="sc-card-title">{t('lignesReconnues')}</span>
                  <div style={{ fontSize: 10.5, color: T.muted }}>
                    {toReview} à vérifier · {isNew} nouveau produit
                  </div>
                </div>
                <span style={{ flex: 1 }} />
                <button className="sc-btn sc-btn-secondary" onClick={() => { setLines([]); setImages([]); }}>
                  Réinitialiser
                </button>
                <button className="sc-btn" onClick={validateAll}
                        style={{ background: '#F3EDF3', color: '#6E4470', border: '1px solid #E3D6E3' }}>
                  <span className="ms">done_all</span>{t('toutValider')}
                </button>
              </div>

              {lines.length === 0 && (
                <div className="sc-empty">
                  Aucune ligne. Photographie le ticket, ou bascule en saisie rapide.
                </div>
              )}

              {lines.map(l => {
                const meta = STATUS_META[l.status];
                const prod = products.find(p => p.id === l.product_id);
                const off = l.ignored || l.status === 'ignored';
                return (
                  <div key={l.key} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                    borderBottom: `1px solid ${T.borderFaint}`,
                    borderLeft: `3px solid ${meta.border}`,
                    background: l.status === 'validated' ? '#FBFCFA' : off ? '#FBFAF7' : undefined,
                    opacity: off ? .62 : 1, flexWrap: 'wrap',
                  }}>
                    {prod?.image_url
                      ? <img src={prod.image_url} alt="" style={thumbStyle(l.raw_label, 30)} />
                      : <div style={thumbStyle(l.raw_label, 30)}>{initials(l.product_name || l.raw_label, 1)}</div>}

                    <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                      <div className="sc-num" style={{ fontSize: 10.5, color: T.muted2 }}>{l.raw_label}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>
                          {l.product_name || '— à créer'}
                        </span>
                        <span className="sc-badge" style={{ background: BADGE[meta.tone].bg, color: BADGE[meta.tone].fg }}>
                          {meta.label}
                        </span>
                      </div>
                      {l.status === 'review' && (l.candidates?.length || 0) > 1 && (
                        <button onClick={() => {
                          const alt = l.candidates!.find(c => c.id !== l.product_id);
                          if (alt) patch(l.key, { product_id: alt.id, product_name: alt.name, status: 'matched' });
                        }} style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontSize: 10.5, color: 'var(--accent)' }}>
                          Autre correspondance : {l.candidates!.find(c => c.id !== l.product_id)?.name}
                        </button>
                      )}
                    </div>

                    {/* Quantité */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <button className="sc-iconbtn" style={{ width: 28, height: 28 }}
                              onClick={() => patch(l.key, { qty: Math.max(1, l.qty - 1) })} aria-label={t('moins')}>
                        <span className="ms">remove</span>
                      </button>
                      <span className="sc-num" style={{ fontSize: 14, fontWeight: 700, minWidth: 20, textAlign: 'center' }}>{l.qty}</span>
                      <button className="sc-iconbtn" style={{ width: 28, height: 28 }}
                              onClick={() => patch(l.key, { qty: l.qty + 1 })} aria-label="Plus">
                        <span className="ms">add</span>
                      </button>
                    </div>

                    <div style={{ textAlign: 'right', minWidth: 86 }}>
                      <div className="sc-num" style={{ fontSize: 12.5, color: T.ink }}>{cur(lineSek(l))}</div>
                      <div className="sc-num" style={{ fontSize: 10, color: T.muted }}>{cur(l.unit_sek)}/u.</div>
                    </div>

                    <div style={{ textAlign: 'right', minWidth: 92 }}>
                      <div className="sc-num" style={{ fontSize: 13, fontWeight: 700, color: off ? T.muted3 : T.green }}>
                        {off ? '—' : eur(lineEur(l))}
                      </div>
                      <div className="sc-num" style={{ fontSize: 10, color: T.muted }}>
                        {off ? 'exclue' : `${eur(unitEur(l))} PA HT/u.`}
                      </div>
                    </div>

                    <button
                      onClick={() => toggleValid(l)}
                      disabled={off}
                      className="sc-btn"
                      style={{
                        background: l.status === 'validated' ? '#F1F6EF' : T.ink,
                        color: l.status === 'validated' ? '#3E5238' : '#fff',
                        border: `1px solid ${l.status === 'validated' ? '#CFE0C8' : T.ink}`,
                        padding: '6px 11px', fontSize: 11.5,
                      }}>
                      {l.status === 'validated' && <span className="ms" style={{ fontSize: 15 }}>check_circle</span>}
                      {l.status === 'validated' ? 'Validée' : 'Valider'}
                    </button>
                  </div>
                );
              })}

              {/* Pied */}
              <div style={{ background: T.surfaceAlt, padding: '13px 15px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 10.5, color: T.muted, flex: '1 1 200px' }}>
                  Entrée valider la ligne · ⌘ Entrée tout valider
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 9.5, color: T.muted, textTransform: 'uppercase', letterSpacing: 1 }}>{t('coutTotal')}</div>
                  <div className="sc-num" style={{ fontSize: 20, fontWeight: 700, color: T.ink }}>{eur(goodsEur)}</div>
                </div>
                <button className="sc-btn sc-btn-secondary" onClick={() => submit(true)} disabled={busy || !lines.length}>
                  Brouillon
                </button>
                <button className="sc-btn sc-btn-green" onClick={() => submit(false)} disabled={busy || !lines.length}>
                  <span className="ms">inventory</span>{busy ? 'Création…' : 'Créer la commande & entrer en stock'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════ MODE SAISIE RAPIDE ══════════ */}
      {mode === 'quick' && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ flex: '2 1 480px', minWidth: 0 }}>
            <div className="sc-card" style={{ overflow: 'visible' }}>
              <div style={{ background: T.surfaceAlt, padding: '13px 15px', borderBottom: `1px solid ${T.border}`, position: 'relative' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div style={{ flex: 3, minWidth: 180, position: 'relative' }}>
                    <label className="sc-label">{tc('product')}</label>
                    <input ref={nameRef} className="sc-input" style={{ height: 36 }}
                           value={qName} placeholder={t('phRecherche')}
                           onChange={e => { setQName(e.target.value); setQPick(null); setSugOpen(true); }}
                           onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (suggestions.length && sugOpen && !qPick) pickSuggestion(suggestions[0]); else addQuickLine(); } }} />
                    {sugOpen && suggestions.length > 0 && (
                      <div style={{
                        position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 30, marginTop: 4,
                        background: '#fff', borderRadius: 8, boxShadow: '0 8px 22px rgba(0,0,0,.07)',
                        border: `1px solid ${T.border}`, overflow: 'hidden',
                      }}>
                        {suggestions.map(p => (
                          <button key={p.id} onClick={() => pickSuggestion(p)}
                            style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', padding: '8px 11px', border: 'none', background: 'none', cursor: 'pointer', borderBottom: `1px solid ${T.borderFaint}` }}>
                            {p.image_url
                              ? <img src={p.image_url} alt="" style={thumbStyle(p.name_fr, 26)} />
                              : <div style={thumbStyle(p.name_fr, 26)}>{initials(p.name_fr, 1)}</div>}
                            <span style={{ minWidth: 0 }}>
                              <span style={{ display: 'block', fontSize: 12.5, color: T.ink }}>{nomProduit(p, lang)}</span>
                              <span style={{ display: 'block', fontSize: 10.5, color: T.muted }}>
                                {p.sort_order ? `SC-${String(p.sort_order).padStart(4, '0')}` : '—'}
                                {p.cost_price ? ` · dernier PA ${eur(p.cost_price)}` : ''}
                              </span>
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ width: 84 }}>
                    <label className="sc-label">Qté</label>
                    <input className="sc-input sc-num" style={{ height: 36, textAlign: 'center' }}
                           value={qQty} onChange={e => setQQty(e.target.value)}
                           onKeyDown={e => { if (e.key === 'Enter') addQuickLine(); }} />
                  </div>
                  <div style={{ width: 120 }}>
                    <label className="sc-label">{t('prixTicket')}</label>
                    <input className="sc-input sc-num" style={{ height: 36, textAlign: 'right' }}
                           value={qPrice} onChange={e => setQPrice(e.target.value)}
                           onKeyDown={e => { if (e.key === 'Enter') addQuickLine(); }} />
                  </div>
                  <button className="sc-btn sc-btn-primary" style={{ height: 36 }} onClick={addQuickLine}>
                    <span className="ms">add</span>{t('ajouter')}
                  </button>
                </div>
              </div>

              {lines.length === 0 && <div className="sc-empty">{t('aucuneLigne')}</div>}

              {lines.map(l => (
                <div key={l.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 15px', borderBottom: `1px solid ${T.borderFaint}` }}>
                  <div style={thumbStyle(l.raw_label, 28)}>{initials(l.product_name || l.raw_label, 1)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, color: T.ink }}>{l.product_name || l.raw_label}</div>
                    <div className="sc-num" style={{ fontSize: 10.5, color: T.muted }}>{l.qty} × {cur(l.unit_sek)}</div>
                  </div>
                  <span className="sc-num" style={{ fontSize: 12.5 }}>{cur(lineSek(l))}</span>
                  <span className="sc-num" style={{ fontSize: 13, fontWeight: 700, color: T.green, minWidth: 80, textAlign: 'right' }}>
                    {eur(lineEur(l))}
                  </span>
                  <button className="sc-iconbtn" onClick={() => setLines(ls => ls.filter(x => x.key !== l.key))} aria-label={t('retirer')}>
                    <span className="ms" style={{ color: T.red }}>close</span>
                  </button>
                </div>
              ))}

              <div style={{ background: T.surfaceAlt, padding: '13px 15px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11.5, color: T.muted }}>{lines.length} ligne(s)</span>
                <span className="sc-num" style={{ fontSize: 12.5, color: T.text2b }}>Total {cur(totalLines)}</span>
                <span style={{ flex: 1 }} />
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 9.5, color: T.muted, textTransform: 'uppercase', letterSpacing: 1 }}>{t('coutHt')}</div>
                  <div className="sc-num" style={{ fontSize: 20, fontWeight: 700, color: T.green }}>{eur(goodsEur)}</div>
                </div>
                <button className="sc-btn sc-btn-green" onClick={() => submit(false)} disabled={busy || !lines.length}>
                  <span className="ms">inventory</span>{busy ? 'Création…' : 'Créer la commande & entrer en stock'}
                </button>
              </div>
            </div>
          </div>

          <div style={{ flex: '1 1 260px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="sc-card" style={{ padding: '13px 15px' }}>
              <div className="sc-card-title" style={{ marginBottom: 9 }}>{t('raccourcis')}</div>
              {[['Entrée', 'valider la ligne et enchaîner'], ['Tab', 'champ suivant'], ['↑ ↓', 'naviguer dans les suggestions']].map(([k, d]) => (
                <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 7 }}>
                  <span className="sc-num" style={{ background: '#F1EDE7', borderRadius: 5, padding: '2px 7px', fontSize: 11, fontWeight: 600 }}>{k}</span>
                  <span style={{ fontSize: 11.5, color: T.text2b }}>{d}</span>
                </div>
              ))}
            </div>
            <div className="sc-card" style={{ padding: '13px 15px' }}>
              <div className="sc-card-title" style={{ marginBottom: 7 }}>{t('derniersAchats')}</div>
              <div style={{ fontSize: 11.5, color: T.text2b, lineHeight: 1.6 }}>
                Le prix proposé vient du dernier prix d’achat connu du produit, reconverti dans la devise du ticket ({cfg.currency}).
                Un écart de plus de 15 % déclenche une confirmation avant d’ajouter la ligne — c’est le
                garde-fou contre une faute de frappe.
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: T.ink, color: '#fff', padding: '10px 18px', borderRadius: 7, fontSize: 12.5, zIndex: 300, maxWidth: 420 }}>
          {toast}
        </div>
      )}
    </>
  );
}
