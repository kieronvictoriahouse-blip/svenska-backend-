'use client';
import React, { useEffect, useMemo, useState } from 'react';
import { adminFetch } from '@/lib/auth-client';
import { useAdminLang, type AdminLang } from '@/lib/admin-i18n';

/* ═══════════════════════════════════════════════════════════════
   ÉTIQUETTES PRODUIT À IMPRIMER  ·  /admin/etiquettes

   Imprime les étiquettes à coller sur les produits (descriptif +
   ingrédients + allergènes + valeurs nutritionnelles), sur les trois
   planches A4 pré-découpées Europe100 :

     · ELA024 — 105 × 148,5 mm — 4 / A4 (grande, fiche complète)
     · ELA011 — 70 × 37 mm     — 24 / A4 (moyenne)
     · ELA002 — 48,5 × 25,4 mm — 40 / A4 (petite)

   Page « nue » (cf. isBare dans admin-nav) : elle gère sa propre mise
   en page pour que Ctrl+P sorte exactement la planche, sans le shell.
   Le rendu utilise des millimètres réels (mm + @page A4) : ce qui est à
   l'écran est ce qui sort de l'imprimante.

   Le calage exact dépend de la marque de planche. On fournit donc des
   valeurs par défaut PLUS un réglage fin (marges / gouttières / décalage)
   persisté par format, et un « test de calage » qui n'imprime que les
   contours : on l'imprime sur une feuille blanche, on la superpose à la
   planche à contre-jour, on ajuste, et c'est calé pour toujours.
   ═══════════════════════════════════════════════════════════════ */

type Cal = { marginTop: number; marginLeft: number; gapX: number; gapY: number; offsetX: number; offsetY: number };
type Fmt = {
  code: string;
  size: 'lg' | 'md' | 'sm';
  name: { fr: string; en: string; sv: string };
  w: number; h: number; cols: number; rows: number;
  cal: Cal;
};

const FORMATS: Record<string, Fmt> = {
  ela024: {
    code: 'ELA024', size: 'lg', name: { fr: 'Grande', en: 'Large', sv: 'Stor' },
    w: 105, h: 148.5, cols: 2, rows: 2,
    cal: { marginTop: 0, marginLeft: 0, gapX: 0, gapY: 0, offsetX: 0, offsetY: 0 },
  },
  ela011: {
    code: 'ELA011', size: 'md', name: { fr: 'Moyenne', en: 'Medium', sv: 'Mellan' },
    w: 70, h: 37, cols: 3, rows: 8,
    cal: { marginTop: 0.5, marginLeft: 0, gapX: 0, gapY: 0, offsetX: 0, offsetY: 0 },
  },
  ela002: {
    code: 'ELA002', size: 'sm', name: { fr: 'Petite', en: 'Small', sv: 'Liten' },
    w: 48.5, h: 25.4, cols: 4, rows: 10,
    cal: { marginTop: 21.5, marginLeft: 5, gapX: 2, gapY: 0, offsetX: 0, offsetY: 0 },
  },
};
type FmtKey = keyof typeof FORMATS;

/* ── Libellés multilingues des étiquettes ─────────────────────── */
const L = {
  ingredients: { fr: 'Ingrédients', en: 'Ingredients', sv: 'Ingredienser' },
  allergenes:  { fr: 'Allergènes', en: 'Allergens', sv: 'Allergener' },
  nutrition:   { fr: 'Valeurs nutritionnelles', en: 'Nutrition', sv: 'Näringsvärde' },
  per100:      { fr: 'pour 100 g', en: 'per 100 g', sv: 'per 100 g' },
  conservation:{ fr: 'À conserver', en: 'Storage', sv: 'Förvaring' },
  origine:     { fr: 'Origine', en: 'Origin', sv: 'Ursprung' },
  poids:       { fr: 'Poids net', en: 'Net weight', sv: 'Nettovikt' },
};
const NUT: Array<[string, { fr: string; en: string; sv: string }, boolean]> = [
  ['energie',      { fr: 'Énergie', en: 'Energy', sv: 'Energi' }, false],
  ['graisses',     { fr: 'Matières grasses', en: 'Fat', sv: 'Fett' }, false],
  ['dont_satures', { fr: 'dont acides gras saturés', en: 'of which saturates', sv: 'varav mättat fett' }, true],
  ['glucides',     { fr: 'Glucides', en: 'Carbohydrate', sv: 'Kolhydrat' }, false],
  ['dont_sucres',  { fr: 'dont sucres', en: 'of which sugars', sv: 'varav sockerarter' }, true],
  ['fibres',       { fr: 'Fibres', en: 'Fibre', sv: 'Fiber' }, false],
  ['proteines',    { fr: 'Protéines', en: 'Protein', sv: 'Protein' }, false],
  ['sel',          { fr: 'Sel', en: 'Salt', sv: 'Salt' }, false],
];

/* Texte d'interface (le sélecteur de langue de l'étiquette est séparé
   de la langue du back-office : on peut piloter le back en anglais et
   imprimer des étiquettes en français). */
const UI = {
  title:       { fr: 'Étiquettes produit', en: 'Product labels', sv: 'Produktetiketter' },
  subtitle:    { fr: 'À coller sur les produits — ingrédients, allergènes, nutrition', en: 'To stick on products — ingredients, allergens, nutrition', sv: 'Att klistra på produkter — ingredienser, allergener, näring' },
  format:      { fr: 'Format de planche', en: 'Sheet format', sv: 'Arkformat' },
  perSheet:    { fr: 'par A4', en: 'per A4', sv: 'per A4' },
  labelLang:   { fr: "Langue de l'étiquette", en: 'Label language', sv: 'Etikettspråk' },
  content:     { fr: 'Contenu', en: 'Content', sv: 'Innehåll' },
  descriptif:  { fr: 'Descriptif', en: 'Description', sv: 'Beskrivning' },
  ingredients: { fr: 'Ingrédients', en: 'Ingredients', sv: 'Ingredienser' },
  allergenes:  { fr: 'Allergènes', en: 'Allergens', sv: 'Allergener' },
  nutrition:   { fr: 'Nutrition', en: 'Nutrition', sv: 'Näring' },
  conservation:{ fr: 'Conservation', en: 'Storage', sv: 'Förvaring' },
  origine:     { fr: 'Origine', en: 'Origin', sv: 'Ursprung' },
  poids:       { fr: 'Poids', en: 'Weight', sv: 'Vikt' },
  prix:        { fr: 'Prix', en: 'Price', sv: 'Pris' },
  ean:         { fr: 'Code EAN', en: 'EAN code', sv: 'EAN-kod' },
  marque:      { fr: 'Marque', en: 'Brand', sv: 'Varumärke' },
  products:    { fr: 'Produits à imprimer', en: 'Products to print', sv: 'Produkter att skriva ut' },
  searchPh:    { fr: 'Rechercher un produit…', en: 'Search a product…', sv: 'Sök produkt…' },
  selected:    { fr: 'Sélection', en: 'Selection', sv: 'Urval' },
  none:        { fr: 'Aucun produit sélectionné.', en: 'No product selected.', sv: 'Ingen produkt vald.' },
  addAll:      { fr: 'Tout ajouter (résultats)', en: 'Add all (results)', sv: 'Lägg till alla' },
  clear:       { fr: 'Vider', en: 'Clear', sv: 'Töm' },
  qty:         { fr: 'étiquettes', en: 'labels', sv: 'etiketter' },
  startAt:     { fr: 'Commencer à la case n°', en: 'Start at cell n°', sv: 'Börja på ruta nr' },
  startHint:   { fr: 'pour réutiliser une planche déjà entamée', en: 'to reuse a partly-used sheet', sv: 'för att återanvända ett påbörjat ark' },
  guides:      { fr: 'Afficher les repères de découpe', en: 'Show cut guides', sv: 'Visa skärlinjer' },
  calTest:     { fr: 'Test de calage (contours seuls)', en: 'Alignment test (outlines only)', sv: 'Justeringstest (endast kontur)' },
  fine:        { fr: 'Réglage fin du calage', en: 'Fine alignment', sv: 'Finjustering' },
  marginTop:   { fr: 'Marge haute (mm)', en: 'Top margin (mm)', sv: 'Övre marginal (mm)' },
  marginLeft:  { fr: 'Marge gauche (mm)', en: 'Left margin (mm)', sv: 'Vänster marginal (mm)' },
  gapX:        { fr: 'Gouttière horiz. (mm)', en: 'Column gap (mm)', sv: 'Kolumnmellanrum (mm)' },
  gapY:        { fr: 'Gouttière vert. (mm)', en: 'Row gap (mm)', sv: 'Radmellanrum (mm)' },
  offsetX:     { fr: 'Décalage X (mm)', en: 'Offset X (mm)', sv: 'Förskjutning X (mm)' },
  offsetY:     { fr: 'Décalage Y (mm)', en: 'Offset Y (mm)', sv: 'Förskjutning Y (mm)' },
  resetCal:    { fr: 'Réinitialiser', en: 'Reset', sv: 'Återställ' },
  print:       { fr: 'Imprimer / PDF', en: 'Print / PDF', sv: 'Skriv ut / PDF' },
  qtyHint:     { fr: 'Quantité = nombre d’étiquettes imprimées. L’aperçu ajoute des pages A4 tout seul.', en: 'Quantity = number of labels printed. The preview adds A4 pages automatically.', sv: 'Antal = antal etiketter. Förhandsvisningen lägger till A4-sidor automatiskt.' },
  pdfHint:     { fr: 'Bouton « Imprimer / PDF » → dans la fenêtre d’impression, choisis « Enregistrer en PDF » comme imprimante pour obtenir le fichier.', en: 'The Print / PDF button → in the print dialog, pick “Save as PDF” as the printer to get the file.', sv: 'Knappen Skriv ut / PDF → välj ”Spara som PDF” i utskriftsdialogen.' },
  back:        { fr: 'Retour', en: 'Back', sv: 'Tillbaka' },
  preview:     { fr: 'Aperçu', en: 'Preview', sv: 'Förhandsvisning' },
  sheets:      { fr: 'planche(s)', en: 'sheet(s)', sv: 'ark' },
  labelsTotal: { fr: 'étiquette(s)', en: 'label(s)', sv: 'etiketter' },
  incomplete:  { fr: 'fiche incomplète (ingrédients manquants)', en: 'incomplete (ingredients missing)', sv: 'ofullständig (ingredienser saknas)' },
  emptyPreview:{ fr: 'Ajoute des produits pour voir la planche.', en: 'Add products to see the sheet.', sv: 'Lägg till produkter för att se arket.' },
  loading:     { fr: 'Chargement…', en: 'Loading…', sv: 'Laddar…' },
  tip:         { fr: "Astuce : imprime en taille réelle (échelle 100 %, pas « ajuster à la page ») pour que les étiquettes tombent pile sur la planche.", en: 'Tip: print at 100% scale (not "fit to page") so labels line up with the sheet.', sv: 'Tips: skriv ut i 100 % skala så att etiketterna hamnar rätt.' },
};

const tr = (e: { fr: string; en: string; sv: string }, lang: AdminLang) => e[lang] || e.fr;

/* Identité de marque (reprise du storefront : mêmes couleurs, mêmes
   polices, même monogramme — l'étiquette doit être « une Swedish
   Cravings » au premier coup d'œil). */
const LOGO_URL = 'https://www.swedishcravings.fr/img/sc-monogramme.png';

type Product = any;
type Opts = {
  descriptif: boolean; ingredients: boolean; allergenes: boolean; nutrition: boolean;
  conservation: boolean; origine: boolean; poids: boolean; prix: boolean; ean: boolean; marque: boolean;
};
const DEFAULT_OPTS: Opts = {
  descriptif: true, ingredients: true, allergenes: true, nutrition: true,
  conservation: true, origine: true, poids: true, prix: false, ean: false, marque: true,
};

const LS = {
  sel: 'sd_labels_selection', fmt: 'sd_labels_format', lang: 'sd_labels_lang',
  opts: 'sd_labels_opts', cal: 'sd_labels_cal',
};
function loadLS<T>(k: string, fallback: T): T {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}

/* Valeur nutritionnelle : « 452 kcal / 1891 kJ » reste tel quel, un
   nombre seul se voit ajouter « g ». */
function fmtNut(key: string, val: string): string {
  const v = String(val || '').trim();
  if (!v) return '';
  if (key === 'energie') return v;
  return /^[\d.,\s]+$/.test(v) ? `${v.replace('.', ',')} g` : v;
}

export default function EtiquettesPage() {
  const uiLang = useAdminLang();
  const t = (e: { fr: string; en: string; sv: string }) => tr(e, uiLang);

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [brand, setBrand] = useState('Swedish Cravings');
  const [tagline, setTagline] = useState('Delikatesser');

  const [query, setQuery] = useState('');
  const [selection, setSelection] = useState<Array<{ id: string; qty: number }>>([]);
  const [fmtKey, setFmtKey] = useState<FmtKey>('ela024');
  const [labelLang, setLabelLang] = useState<AdminLang>('fr');
  const [opts, setOpts] = useState<Opts>(DEFAULT_OPTS);
  const [startAt, setStartAt] = useState(1);
  const [guides, setGuides] = useState(true);
  const [calTest, setCalTest] = useState(false);
  const [showFine, setShowFine] = useState(false);
  const [cals, setCals] = useState<Record<string, Cal>>({});

  /* ── Chargement ─────────────────────────────────────────────── */
  useEffect(() => {
    setSelection(loadLS(LS.sel, []));
    setFmtKey(loadLS<FmtKey>(LS.fmt, 'ela024'));
    setLabelLang(loadLS<AdminLang>(LS.lang, 'fr'));
    setOpts({ ...DEFAULT_OPTS, ...loadLS<Partial<Opts>>(LS.opts, {}) });
    setCals(loadLS<Record<string, Cal>>(LS.cal, {}));
    (async () => {
      try {
        const [pj, wl] = await Promise.all([
          adminFetch('/api/products?limit=1000').then(r => r.json()),
          adminFetch('/api/white-label').then(r => r.json()).catch(() => ({})),
        ]);
        setProducts(pj.products || []);
        if (wl?.config?.site_name) setBrand(wl.config.site_name);
        if (wl?.config?.site_slogan) setTagline(wl.config.site_slogan);
      } finally { setLoading(false); }
    })();
  }, []);

  /* ── Persistance ────────────────────────────────────────────── */
  useEffect(() => { try { localStorage.setItem(LS.sel, JSON.stringify(selection)); } catch {} }, [selection]);
  useEffect(() => { try { localStorage.setItem(LS.fmt, JSON.stringify(fmtKey)); } catch {} }, [fmtKey]);
  useEffect(() => { try { localStorage.setItem(LS.lang, JSON.stringify(labelLang)); } catch {} }, [labelLang]);
  useEffect(() => { try { localStorage.setItem(LS.opts, JSON.stringify(opts)); } catch {} }, [opts]);
  useEffect(() => { try { localStorage.setItem(LS.cal, JSON.stringify(cals)); } catch {} }, [cals]);

  const fmt = FORMATS[fmtKey];
  const cal: Cal = { ...fmt.cal, ...(cals[fmtKey] || {}) };
  const setCal = (patch: Partial<Cal>) =>
    setCals(c => ({ ...c, [fmtKey]: { ...fmt.cal, ...(c[fmtKey] || {}), ...patch } }));

  const byId = useMemo(() => Object.fromEntries(products.map(p => [String(p.id), p])), [products]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? products.filter(p =>
          [p.name_fr, p.name_en, p.name_sv, p.sku, p.ean].some(v => String(v || '').toLowerCase().includes(q)))
      : products;
    return list.slice(0, 300);
  }, [products, query]);

  const field = (p: Product, base: string): string =>
    p?.[`${base}_${labelLang}`] || p?.[`${base}_fr`] || p?.[`${base}_en`] || p?.[`${base}_sv`] || '';
  const nameOf = (p: Product): string => field(p, 'name') || p?.name || 'Produit';

  const setQty = (id: string, qty: number) =>
    setSelection(s => s.map(x => x.id === id ? { ...x, qty: Math.max(1, qty) } : x));
  const add = (id: string) =>
    setSelection(s => s.find(x => x.id === id) ? s : [...s, { id, qty: 1 }]);
  const remove = (id: string) => setSelection(s => s.filter(x => x.id !== id));
  const addAll = () => setSelection(s => {
    const have = new Set(s.map(x => x.id));
    return [...s, ...filtered.filter(p => !have.has(String(p.id))).map(p => ({ id: String(p.id), qty: 1 }))];
  });

  /* ── Cases de la planche ────────────────────────────────────── */
  const perPage = fmt.cols * fmt.rows;
  const cells: Array<Product | null> = useMemo(() => {
    const out: Array<Product | null> = [];
    for (let i = 0; i < Math.max(0, startAt - 1); i++) out.push(null); // sauter les cases déjà utilisées
    for (const sel of selection) {
      const p = byId[sel.id];
      if (!p) continue;
      for (let i = 0; i < sel.qty; i++) out.push(p);
    }
    return out;
  }, [selection, byId, startAt]);

  const pages: Array<Array<Product | null>> = useMemo(() => {
    if (calTest) return [Array.from({ length: perPage }, () => null)]; // planche de calage : contours seuls
    const chunks: Array<Array<Product | null>> = [];
    for (let i = 0; i < cells.length; i += perPage) {
      const page = cells.slice(i, i + perPage);
      while (page.length < perPage) page.push(null);
      chunks.push(page);
    }
    return chunks.length ? chunks : (cells.length ? [Array.from({ length: perPage }, () => null)] : []);
  }, [cells, perPage, calTest]);

  const totalLabels = cells.filter(Boolean).length;

  /* ── Rendu d'une étiquette ──────────────────────────────────── */
  const Logo = () => (
    <img className="lbl-logo" src={LOGO_URL} alt=""
         onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
  );

  const renderLabel = (p: Product | null, key: string) => {
    const outline = guides || calTest;
    if (!p) return <div key={key} className="lbl empty" data-outline={outline ? '1' : undefined} />;

    const size = fmt.size;
    const ing = field(p, 'ingredients');
    const alg = field(p, 'allergens');
    const desc = field(p, 'desc') || field(p, 'subtitle');
    const stor = field(p, 'storage');
    const orig = field(p, 'origin');
    const nut = p.nutrition || {};
    const hasNut = NUT.some(([k]) => String(nut[k] || '').trim());
    const priceTxt = p.price != null && p.price !== '' ? `${Number(p.price).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €` : '';

    /* ── GRAND (fiche complète, façon papeterie de marque) ── */
    if (size === 'lg') {
      return (
        <div key={key} className="lbl s-lg" data-outline={outline ? '1' : undefined}>
          <div className="lbl-in">
            {opts.marque && (
              <header className="lbl-head">
                <Logo />
                <div className="lbl-brand">
                  <span className="bm">{brand}</span>
                  {tagline && <span className="bt">{tagline}</span>}
                </div>
              </header>
            )}

            <div className="lbl-name">{nameOf(p)}</div>
            {opts.descriptif && desc && <div className="lbl-desc">{desc}</div>}

            <div className="lbl-body">
              {opts.ingredients && ing && (
                <div className="sec">
                  <div className="sec-lab">{t(L.ingredients)}</div>
                  <div className="sec-txt">{ing}</div>
                </div>
              )}

              {opts.allergenes && alg && (
                <div className="alg-box">
                  <span className="alg-lab">{t(L.allergenes)}</span>
                  <span className="alg-txt">{alg}</span>
                </div>
              )}

              {opts.nutrition && hasNut && (
                <table className="lbl-nut">
                  <thead>
                    <tr><th colSpan={2}>{t(L.nutrition)} <span className="per">{t(L.per100)}</span></th></tr>
                  </thead>
                  <tbody>
                    {NUT.map(([k, lab, sub]) => {
                      const v = fmtNut(k, nut[k]);
                      if (!v) return null;
                      return (
                        <tr key={k} className={sub ? 'sub' : ''}>
                          <td>{sub ? '— ' : ''}{t(lab)}</td>
                          <td className="val">{v}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}

              {opts.conservation && stor && (
                <div className="sec sec-inline">
                  <span className="sec-lab">{t(L.conservation)}</span>
                  <span className="sec-txt">{stor}</span>
                </div>
              )}
            </div>

            <footer className="lbl-foot">
              <div className="foot-l">
                {opts.origine && orig && <span>{t(L.origine)} · {orig}</span>}
                {opts.ean && p.ean && <span className="ean">{p.ean}</span>}
              </div>
              <div className="foot-r">
                {opts.prix && priceTxt && <span className="price">{priceTxt}</span>}
                {opts.poids && p.weight && <span className="net">{p.weight}</span>}
              </div>
            </footer>
          </div>
        </div>
      );
    }

    /* ── MOYEN ── */
    if (size === 'md') {
      return (
        <div key={key} className="lbl s-md" data-outline={outline ? '1' : undefined}>
          <div className="lbl-in">
            <div className="md-top">
              <div className="md-title">
                <div className="lbl-name">{nameOf(p)}</div>
                {opts.descriptif && desc && <div className="lbl-desc">{desc}</div>}
              </div>
              {opts.marque && <Logo />}
            </div>

            {opts.ingredients && ing && (
              <div className="sec-txt ing"><span className="sec-lab">{t(L.ingredients)}</span> {ing}</div>
            )}
            {opts.allergenes && alg && (
              <div className="alg-box"><span className="alg-lab">{t(L.allergenes)}</span><span className="alg-txt">{alg}</span></div>
            )}
            {opts.nutrition && hasNut && nut.energie && (
              <div className="lbl-energie">{t(NUT[0][1])} {fmtNut('energie', nut.energie)} · {t(L.per100)}</div>
            )}

            <footer className="lbl-foot">
              <span className="foot-l">
                {opts.poids && p.weight && <b>{p.weight}</b>}
                {opts.prix && priceTxt && <span className="price"> · {priceTxt}</span>}
              </span>
              {opts.marque && <span className="foot-brand">{brand}</span>}
            </footer>
          </div>
        </div>
      );
    }

    /* ── PETIT ── */
    return (
      <div key={key} className="lbl s-sm" data-outline={outline ? '1' : undefined}>
        <div className="lbl-in">
          <div className="lbl-name">{nameOf(p)}</div>
          {opts.allergenes && alg && (
            <div className="sm-alg"><span>{t(L.allergenes)} :</span> {alg}</div>
          )}
          <footer className="lbl-foot">
            <span className="foot-l">
              {opts.poids && p.weight && <b>{p.weight}</b>}
              {opts.prix && priceTxt && <span className="price"> · {priceTxt}</span>}
            </span>
            {opts.marque && <span className="foot-brand">{brand}</span>}
          </footer>
        </div>
      </div>
    );
  };

  const gridStyle: React.CSSProperties = {
    gridTemplateColumns: `repeat(${fmt.cols}, ${fmt.w}mm)`,
    gridAutoRows: `${fmt.h}mm`,
    columnGap: `${cal.gapX}mm`,
    rowGap: `${cal.gapY}mm`,
    paddingTop: `${cal.marginTop + cal.offsetY}mm`,
    paddingLeft: `${cal.marginLeft + cal.offsetX}mm`,
  };

  const num = (label: string, val: number, on: (n: number) => void, step = 0.5) => (
    <label className="mini">
      <span>{label}</span>
      <input type="number" step={step} value={val} onChange={e => on(parseFloat(e.target.value) || 0)} />
    </label>
  );

  return (
    <div className="etq-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ── Barre d'action (masquée à l'impression) ── */}
      <div className="etq-bar no-print">
        <a className="btn ghost" href="/admin/produits">← {t(UI.back)}</a>
        <div className="etq-titles">
          <strong>{t(UI.title)}</strong>
          <span>{t(UI.subtitle)}</span>
        </div>
        <span className="etq-count">
          {pages.length} {t(UI.sheets)} · {totalLabels} {t(UI.labelsTotal)}
        </span>
        <button className="btn primary" disabled={!totalLabels && !calTest} onClick={() => window.print()}>
          🖨 {t(UI.print)}
        </button>
      </div>

      <div className="etq-body">
        {/* ── Panneau de réglages ── */}
        <aside className="etq-panel no-print">
          {/* Format */}
          <section>
            <h3>{t(UI.format)}</h3>
            <div className="fmt-grid">
              {(Object.keys(FORMATS) as FmtKey[]).map(k => {
                const f = FORMATS[k];
                return (
                  <button key={k} className={`fmt ${k === fmtKey ? 'on' : ''}`} onClick={() => setFmtKey(k)}>
                    <span className="fmt-mini" style={{ aspectRatio: `${f.w} / ${f.h}` }} />
                    <b>{tr(f.name, uiLang)}</b>
                    <em>{f.w}×{f.h} mm</em>
                    <em>{f.cols * f.rows} {t(UI.perSheet)} · {f.code}</em>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Langue de l'étiquette */}
          <section>
            <h3>{t(UI.labelLang)}</h3>
            <div className="seg">
              {(['fr', 'en', 'sv'] as AdminLang[]).map(l => (
                <button key={l} className={l === labelLang ? 'on' : ''} onClick={() => setLabelLang(l)}>
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
          </section>

          {/* Contenu */}
          <section>
            <h3>{t(UI.content)}</h3>
            <div className="checks">
              {([
                ['descriptif', UI.descriptif], ['ingredients', UI.ingredients], ['allergenes', UI.allergenes],
                ['nutrition', UI.nutrition], ['conservation', UI.conservation], ['origine', UI.origine],
                ['poids', UI.poids], ['prix', UI.prix], ['ean', UI.ean], ['marque', UI.marque],
              ] as Array<[keyof Opts, { fr: string; en: string; sv: string }]>).map(([k, lab]) => (
                <label key={k} className="chk">
                  <input type="checkbox" checked={opts[k]} onChange={e => setOpts(o => ({ ...o, [k]: e.target.checked }))} />
                  {t(lab)}
                </label>
              ))}
            </div>
            {fmt.size === 'sm' && (
              <p className="note">ℹ {labelLang === 'fr'
                ? "Le petit format ne tient que le nom, les allergènes et le poids."
                : 'The small format only fits name, allergens and weight.'}</p>
            )}
          </section>

          {/* Planche */}
          <section>
            <h3>{t(UI.startAt)}</h3>
            <input className="num-in" type="number" min={1} max={perPage} value={startAt}
                   onChange={e => setStartAt(Math.min(perPage, Math.max(1, parseInt(e.target.value) || 1)))} />
            <p className="note">{t(UI.startHint)}</p>
            <label className="chk"><input type="checkbox" checked={guides} onChange={e => setGuides(e.target.checked)} />{t(UI.guides)}</label>
            <label className="chk"><input type="checkbox" checked={calTest} onChange={e => setCalTest(e.target.checked)} />{t(UI.calTest)}</label>
          </section>

          {/* Réglage fin */}
          <section>
            <button className="fine-toggle" onClick={() => setShowFine(v => !v)}>
              {showFine ? '▾' : '▸'} {t(UI.fine)} ({fmt.code})
            </button>
            {showFine && (
              <div className="fine">
                {num(t(UI.marginTop), cal.marginTop, v => setCal({ marginTop: v }))}
                {num(t(UI.marginLeft), cal.marginLeft, v => setCal({ marginLeft: v }))}
                {num(t(UI.gapX), cal.gapX, v => setCal({ gapX: v }))}
                {num(t(UI.gapY), cal.gapY, v => setCal({ gapY: v }))}
                {num(t(UI.offsetX), cal.offsetX, v => setCal({ offsetX: v }))}
                {num(t(UI.offsetY), cal.offsetY, v => setCal({ offsetY: v }))}
                <button className="btn ghost sm" onClick={() => setCals(c => { const n = { ...c }; delete n[fmtKey]; return n; })}>
                  ↺ {t(UI.resetCal)}
                </button>
              </div>
            )}
          </section>

          {/* Produits */}
          <section>
            <h3>{t(UI.products)}</h3>
            <input className="search" placeholder={t(UI.searchPh)} value={query} onChange={e => setQuery(e.target.value)} />
            <div className="prod-actions">
              <button className="btn ghost sm" onClick={addAll}>+ {t(UI.addAll)}</button>
              {selection.length > 0 && <button className="btn ghost sm" onClick={() => setSelection([])}>✕ {t(UI.clear)}</button>}
            </div>

            {loading ? <p className="note">{t(UI.loading)}</p> : (
              <div className="prod-list">
                {filtered.map(p => {
                  const inSel = selection.some(x => x.id === String(p.id));
                  const incomplete = !field(p, 'ingredients');
                  return (
                    <button key={p.id} className={`prow ${inSel ? 'in' : ''}`} onClick={() => inSel ? remove(String(p.id)) : add(String(p.id))}>
                      <span className="pthumb">{p.image_url
                        ? <img src={`${p.image_url.replace('/object/public/', '/render/image/public/')}?width=48&height=48&resize=cover&quality=70`} alt="" />
                        : '📦'}</span>
                      <span className="pname">
                        {nameOf(p)}
                        {incomplete && <em title={t(UI.incomplete)}> ⚠</em>}
                      </span>
                      <span className="pmark">{inSel ? '✓' : '+'}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* Sélection */}
          {selection.length > 0 && (
            <section>
              <h3>{t(UI.selected)} ({selection.length})</h3>
              <p className="note" style={{ margin: '0 0 10px' }}>{t(UI.qtyHint)}</p>
              <div className="sel-list">
                {selection.map(sel => {
                  const p = byId[sel.id];
                  if (!p) return null;
                  return (
                    <div key={sel.id} className="srow">
                      <span className="sname">{nameOf(p)}</span>
                      <div className="qty">
                        <button onClick={() => setQty(sel.id, sel.qty - 1)}>−</button>
                        <input type="number" min={1} value={sel.qty} onChange={e => setQty(sel.id, parseInt(e.target.value) || 1)} />
                        <button onClick={() => setQty(sel.id, sel.qty + 1)}>+</button>
                      </div>
                      <button className="srm" onClick={() => remove(sel.id)}>✕</button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <p className="tip note">{t(UI.pdfHint)}</p>
          <p className="note" style={{ marginTop: 8 }}>{t(UI.tip)}</p>
        </aside>

        {/* ── Aperçu / impression ── */}
        <main className="etq-preview">
          {pages.length === 0 ? (
            <div className="empty-preview no-print">{t(UI.emptyPreview)}</div>
          ) : pages.map((page, pi) => (
            <div key={pi} className="sheet">
              <div className="grid" style={gridStyle}>
                {page.map((p, ci) => renderLabel(p, `${pi}-${ci}`))}
              </div>
            </div>
          ))}
        </main>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   STYLES — écran (panneau + aperçu) et impression (mm réels)
   ═══════════════════════════════════════════════════════════════ */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500;1,600&family=Crimson+Pro:ital@0;1&family=Jost:wght@400;500;600&display=swap');
.etq-root {
  --sc-green: #3D5239; --sc-green-mid: #566E52; --sc-lingon: #C4733A; --sc-lingon-deep: #9A5228;
  --sc-lingon-pale: #FBF0E4; --sc-cream: #F8F4ED; --sc-parch: #EEE6D6; --sc-linen: #DDD3BE;
  --sc-ink: #1B2118; --sc-slate: #3A4636; --sc-dust: #6C7A68;
  --sc-display: 'Cormorant Garamond', Georgia, serif; --sc-body: 'Crimson Pro', Georgia, serif;
  font-family: Jost, system-ui, -apple-system, sans-serif; color: #1a1a1a; background: #e9e7e2; min-height: 100vh;
}
.etq-bar { position: sticky; top: 0; z-index: 20; display: flex; align-items: center; gap: 14px;
  padding: 10px 16px; background: #fff; border-bottom: 1px solid #ddd; box-shadow: 0 1px 4px rgba(0,0,0,.05); }
.etq-titles { display: flex; flex-direction: column; line-height: 1.2; }
.etq-titles strong { font-size: 15px; }
.etq-titles span { font-size: 11px; color: #888; }
.etq-count { margin-left: auto; font-size: 12px; color: #666; white-space: nowrap; }
.btn { border: 1px solid #ccc; background: #fff; border-radius: 8px; padding: 8px 14px; font: inherit;
  font-size: 13px; cursor: pointer; text-decoration: none; color: #222; transition: .15s; }
.btn:hover { background: #f5f5f5; }
.btn.primary { background: #3D5239; color: #fff; border-color: #3D5239; font-weight: 600; }
.btn.primary:hover { background: #2e3f2b; }
.btn.primary:disabled { opacity: .4; cursor: not-allowed; }
.btn.ghost { background: transparent; }
.btn.sm { padding: 5px 9px; font-size: 12px; }

.etq-body { display: flex; align-items: flex-start; }
.etq-panel { width: 340px; flex: none; height: calc(100vh - 57px); overflow-y: auto; position: sticky; top: 57px;
  background: #fff; border-right: 1px solid #ddd; padding: 4px 16px 40px; }
.etq-panel section { padding: 14px 0; border-bottom: 1px solid #eee; }
.etq-panel h3 { font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: #999; margin: 0 0 10px; }

.fmt-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
.fmt { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 10px 6px;
  border: 1.5px solid #ddd; border-radius: 10px; background: #fafafa; cursor: pointer; }
.fmt.on { border-color: #3D5239; background: #EAF2E7; }
.fmt b { font-size: 12px; }
.fmt em { font-size: 9px; color: #888; font-style: normal; text-align: center; line-height: 1.2; }
.fmt-mini { width: 34px; background: #fff; border: 1px solid #bbb; border-radius: 2px; }
.fmt.on .fmt-mini { border-color: #3D5239; }

.seg { display: flex; gap: 6px; }
.seg button { flex: 1; padding: 7px; border: 1px solid #ddd; background: #fff; border-radius: 7px; cursor: pointer; font: inherit; font-size: 12px; }
.seg button.on { background: #3D5239; color: #fff; border-color: #3D5239; }

.checks { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 10px; }
.chk { display: flex; align-items: center; gap: 7px; font-size: 12.5px; cursor: pointer; }
.chk input { accent-color: #3D5239; }
.note { font-size: 11px; color: #999; margin: 8px 0 0; line-height: 1.4; }
.tip { border-top: 1px dashed #ddd; padding-top: 12px; margin-top: 14px; }

.num-in { width: 80px; padding: 7px; border: 1px solid #ccc; border-radius: 7px; font: inherit; }
.fine-toggle { border: none; background: none; font: inherit; font-size: 13px; cursor: pointer; color: #3D5239; padding: 0; }
.fine { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px; }
.mini { display: flex; flex-direction: column; gap: 3px; font-size: 10.5px; color: #777; }
.mini input { padding: 5px; border: 1px solid #ccc; border-radius: 6px; font: inherit; font-size: 12px; }

.search { width: 100%; padding: 9px 11px; border: 1px solid #ccc; border-radius: 8px; font: inherit; font-size: 13px; box-sizing: border-box; }
.prod-actions { display: flex; gap: 8px; margin: 8px 0; }
.prod-list { max-height: 280px; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; margin: 0 -4px; }
.prow { display: flex; align-items: center; gap: 9px; padding: 6px 8px; border: none; background: none; border-radius: 8px;
  cursor: pointer; text-align: left; font: inherit; width: 100%; }
.prow:hover { background: #f2f2f2; }
.prow.in { background: #EAF2E7; }
.pthumb { width: 28px; height: 28px; flex: none; display: flex; align-items: center; justify-content: center;
  background: #f1eadc; border-radius: 6px; overflow: hidden; font-size: 14px; }
.pthumb img { width: 100%; height: 100%; object-fit: cover; }
.pname { flex: 1; font-size: 12.5px; line-height: 1.25; }
.pname em { color: #c9820a; font-style: normal; }
.pmark { color: #3D5239; font-weight: 700; }

.sel-list { display: flex; flex-direction: column; gap: 5px; }
.srow { display: flex; align-items: center; gap: 8px; }
.sname { flex: 1; font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.qty { display: flex; align-items: center; border: 1px solid #ddd; border-radius: 7px; overflow: hidden; }
.qty button { border: none; background: #f5f5f5; width: 24px; height: 26px; cursor: pointer; font-size: 15px; }
.qty input { width: 34px; border: none; text-align: center; font: inherit; font-size: 12px; }
.srm { border: none; background: none; color: #c33; cursor: pointer; font-size: 13px; }

.etq-preview { flex: 1; padding: 24px; display: flex; flex-direction: column; align-items: center; gap: 24px; }
.empty-preview { color: #999; padding: 80px 20px; font-size: 14px; }

/* La planche : A4 réel. print-color-adjust:exact → l'imprimante garde le
   fond terracotta des allergènes et les couleurs de marque (sinon Chrome
   les supprime à l'impression). */
.sheet { width: 210mm; height: 297mm; background: #fff; box-shadow: 0 2px 16px rgba(0,0,0,.15); position: relative; overflow: hidden;
  -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.grid { display: grid; box-sizing: border-box; }
.lbl { box-sizing: border-box; overflow: hidden; width: 100%; height: 100%; position: relative; color: var(--sc-ink); }
.lbl[data-outline="1"] { outline: 0.1mm dashed #c9c9c9; outline-offset: -0.05mm; }
.lbl.empty { background: transparent; }
.lbl-in { width: 100%; height: 100%; box-sizing: border-box; display: flex; flex-direction: column; overflow: hidden; }

/* Le monogramme SC : son fond crème disparaît sur le blanc grâce au
   fondu « multiply », il ne reste que la lettre verte et la couronne. */
.lbl-logo { display: block; object-fit: contain; mix-blend-mode: multiply; flex: none; }

.lbl-name { font-family: var(--sc-display); font-weight: 600; color: var(--sc-green); line-height: 1.04; }
.lbl-desc { font-family: var(--sc-body); font-style: italic; color: var(--sc-slate); }

.sec-lab { font-family: Jost, sans-serif; font-weight: 600; text-transform: uppercase; letter-spacing: .12em; color: var(--sc-green-mid); }
.sec-txt { font-family: var(--sc-body); color: var(--sc-ink); }

/* Encadré allergènes — le seul aplat de couleur, pour qu'il saute aux yeux. */
.alg-box { background: var(--sc-lingon-pale); border-left: 0.6mm solid var(--sc-lingon); border-radius: 0.5mm; }
.alg-lab { font-family: Jost, sans-serif; font-weight: 600; text-transform: uppercase; letter-spacing: .1em; color: var(--sc-lingon-deep); }
.alg-txt { font-family: var(--sc-body); color: var(--sc-lingon-deep); font-weight: 600; }

.lbl-foot { margin-top: auto; display: flex; justify-content: space-between; align-items: flex-end; gap: 2mm; font-family: Jost, sans-serif; }
.foot-r { text-align: right; display: flex; align-items: baseline; gap: 2mm; }
.foot-r .price, .foot-l .price { font-family: var(--sc-display); font-weight: 600; color: var(--sc-lingon); }
.foot-r .net { font-weight: 600; color: var(--sc-ink); }
.foot-brand { font-family: var(--sc-display); font-weight: 600; color: var(--sc-green); }

/* Tableau nutritionnel. */
.lbl-nut { width: 100%; border-collapse: collapse; }
.lbl-nut th { text-align: left; font-family: Jost, sans-serif; font-weight: 600; text-transform: uppercase; letter-spacing: .08em;
  color: var(--sc-green); border-bottom: 0.3mm solid var(--sc-green); padding-bottom: 0.5mm; }
.lbl-nut th .per { font-weight: 400; text-transform: none; letter-spacing: 0; color: var(--sc-dust); }
.lbl-nut td { font-family: var(--sc-body); border-bottom: 0.15mm solid var(--sc-linen); padding: 0.35mm 0; }
.lbl-nut td.val { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.lbl-nut tr.sub td { color: var(--sc-dust); padding-left: 1.5mm; }

/* ── Grand (105×148,5) — la fiche complète ── */
.lbl.s-lg .lbl-in { padding: 5mm; }
.lbl.s-lg .lbl-head { display: flex; align-items: center; gap: 2.5mm; padding-bottom: 2mm; border-bottom: 0.25mm solid var(--sc-linen); }
.lbl.s-lg .lbl-logo { height: 9mm; }
.lbl.s-lg .lbl-brand { display: flex; flex-direction: column; }
.lbl.s-lg .bm { font-family: var(--sc-display); font-weight: 600; font-size: 12.5pt; color: var(--sc-green); line-height: 1; }
.lbl.s-lg .bt { font-family: Jost, sans-serif; font-size: 4.4pt; text-transform: uppercase; letter-spacing: .3em; color: var(--sc-lingon); margin-top: 0.5mm; }
.lbl.s-lg .lbl-name { font-size: 16pt; margin-top: 2.5mm; }
.lbl.s-lg .lbl-desc { font-size: 8.5pt; margin-top: 0.5mm; }
.lbl.s-lg .lbl-body { margin-top: 2mm; display: flex; flex-direction: column; gap: 1.8mm; min-height: 0; }
.lbl.s-lg .sec-lab { font-size: 6pt; margin-bottom: 0.4mm; }
.lbl.s-lg .sec-txt { font-size: 7.5pt; line-height: 1.3; }
.lbl.s-lg .sec > .sec-txt { display: -webkit-box; -webkit-line-clamp: 5; -webkit-box-orient: vertical; overflow: hidden; }
.lbl.s-lg .sec-inline { display: flex; gap: 1.5mm; align-items: baseline; }
.lbl.s-lg .sec-inline .sec-lab { white-space: nowrap; margin: 0; }
.lbl.s-lg .alg-box { padding: 1.4mm 2mm; display: flex; flex-direction: column; gap: 0.3mm; }
.lbl.s-lg .alg-lab { font-size: 6pt; }
.lbl.s-lg .alg-txt { font-size: 7.5pt; line-height: 1.2; }
.lbl.s-lg .lbl-foot { font-size: 7pt; padding-top: 2mm; border-top: 0.25mm solid var(--sc-linen); }
.lbl.s-lg .foot-l { display: flex; flex-direction: column; gap: 0.3mm; color: var(--sc-dust); }
.lbl.s-lg .foot-l .ean { font-variant-numeric: tabular-nums; letter-spacing: .05em; }
.lbl.s-lg .foot-r .price { font-size: 12pt; }
.lbl.s-lg .foot-r .net { font-size: 8.5pt; }

/* ── Moyen (70×37) ── */
.lbl.s-md .lbl-in { padding: 2.2mm 2.5mm; }
.lbl.s-md .md-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 1.5mm; }
.lbl.s-md .md-title { min-width: 0; }
.lbl.s-md .lbl-logo { height: 6mm; }
.lbl.s-md .lbl-name { font-size: 9pt; }
.lbl.s-md .lbl-desc { font-size: 5.8pt; margin-top: 0.2mm; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden; }
.lbl.s-md .ing { font-family: var(--sc-body); font-size: 5.8pt; line-height: 1.2; margin-top: 1mm; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.lbl.s-md .ing .sec-lab { font-size: 5pt; }
.lbl.s-md .alg-box { margin-top: 1mm; padding: 0.8mm 1.2mm; display: flex; gap: 1mm; align-items: baseline; }
.lbl.s-md .alg-lab { font-size: 5pt; white-space: nowrap; }
.lbl.s-md .alg-txt { font-size: 5.6pt; line-height: 1.1; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden; }
.lbl.s-md .lbl-energie { font-family: Jost, sans-serif; font-size: 5.4pt; color: var(--sc-dust); margin-top: 0.8mm; }
.lbl.s-md .lbl-foot { font-size: 5.8pt; padding-top: 0.8mm; }
.lbl.s-md .foot-l b { color: var(--sc-ink); }
.lbl.s-md .foot-brand { font-size: 6.2pt; }

/* ── Petit (48,5×25,4) ── */
.lbl.s-sm .lbl-in { padding: 1.6mm 1.8mm; }
.lbl.s-sm .lbl-name { font-size: 7.5pt; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.lbl.s-sm .sm-alg { font-family: var(--sc-body); font-size: 5pt; line-height: 1.15; margin-top: 0.6mm; color: var(--sc-lingon-deep);
  display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden; }
.lbl.s-sm .sm-alg span { font-family: Jost, sans-serif; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; }
.lbl.s-sm .lbl-foot { font-size: 5.4pt; padding-top: 0.4mm; }
.lbl.s-sm .foot-l b { color: var(--sc-ink); }
.lbl.s-sm .foot-brand { font-size: 5.6pt; }

/* ── Impression ── */
@media print {
  @page { size: A4; margin: 0; }
  html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
  .no-print { display: none !important; }
  .etq-root { background: #fff !important; min-height: 0 !important; }
  .etq-body { display: block !important; }
  .etq-preview { padding: 0 !important; gap: 0 !important; display: block !important; }
  .sheet { box-shadow: none !important; width: 210mm !important; height: 297mm !important;
    page-break-after: always; break-after: page; }
  .sheet:last-child { page-break-after: auto; break-after: auto; }
  .lbl[data-outline="1"] { outline-color: #d8d8d8; }
}
`;
