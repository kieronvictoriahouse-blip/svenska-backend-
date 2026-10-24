'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { adminFetch } from '@/lib/auth-client';
import { T, BADGE, thumbStyle, initials, eur, num, stockColor } from '@/lib/admin-theme';
import BarcodeScanner from '@/components/BarcodeScanner';
import { SqueletteTable } from '@/components/Squelette';
import { MenuActions, MenuItem } from '@/components/MenuActions';
import { useIsMobile } from '@/lib/use-mobile';
import { useT, nomProduit } from '@/lib/admin-i18n';
import { TST } from './i18n';

/* Téléphone (réserve, comptage) : la liste devient des cartes avec un
   pas-à-pas de 48 px, la recherche reste collée en haut, les cartes de
   synthèse filtrent la liste, et l'inventaire par scan s'ouvre en plein
   écran. Ordinateur : rendu inchangé. */
const CSS = `
  .st-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(178px, 1fr)); gap: 10px; margin-bottom: 12px; }
  .st-mini { padding: 5px 10px; font-size: 11px; }
  .st-inv-scan { width: 220px; flex-shrink: 0; }
  .sc-actions > .st-plus { flex: 0 0 48px; width: 48px; padding: 0; justify-content: center; }
  .st-search { display: none; }
  @media (max-width: 899px) {
    .st-mini { padding: 10px 14px; font-size: 14px; }
    .st-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .st-kpi { display: block; width: 100%; text-align: left; font-family: inherit; cursor: pointer; border-radius: 10px; padding: 10px 12px; min-height: 64px; }
    .st-kpi[aria-pressed="true"] { box-shadow: inset 0 0 0 2px currentColor; }
    .st-kpi-l { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; letter-spacing: .6px; text-transform: uppercase; }
    .st-kpi-v { font-size: 21px; font-weight: 700; margin-top: 3px; }

    .st-search { display: flex; position: sticky; top: 0; z-index: 6; gap: 8px; align-items: center; margin: 0 -12px 10px; padding: 8px 12px; background: ${T.appBg}; }
    .st-search-f { position: relative; flex: 1; min-width: 0; }
    .st-search-f > .ms { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); font-size: 20px; color: ${T.muted}; pointer-events: none; }
    .st-search-f input { padding-left: 40px; padding-right: 44px; }
    .st-search-f button { position: absolute; right: 0; top: 0; }

    .st-item { padding: 12px; border-bottom: 1px solid ${T.border}; }
    .st-item:last-child { border-bottom: none; }
    .st-item-top { display: flex; align-items: center; gap: 4px; }
    .st-item-link { flex: 1; min-width: 0; display: flex; align-items: center; gap: 11px; text-decoration: none; }
    .st-item-name { display: block; font-size: 15px; font-weight: 600; color: ${T.ink}; line-height: 1.3; }
    .st-item-ref { display: block; font-size: 12.5px; color: ${T.muted}; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .st-item-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 10px; }
    .st-stepper { display: flex; align-items: center; gap: 6px; }
    .st-step { width: 48px; height: 48px; border-radius: 10px; border: 1px solid ${T.borderField}; background: #fff; color: ${T.ink}; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; touch-action: manipulation; }
    .st-step .ms { font-size: 24px; }
    .st-step:active { background: ${T.borderFaint2}; }
    .st-step:disabled { opacity: .4; cursor: not-allowed; }
    .st-qty { width: 72px !important; height: 48px !important; padding: 0 4px !important; text-align: center; font-size: 20px !important; font-weight: 700; border-radius: 10px; }
    .st-dispo { text-align: right; }
    .st-dispo-k { display: block; font-size: 12px; font-weight: 600; letter-spacing: .6px; text-transform: uppercase; color: ${T.muted}; }
    .st-dispo-v { display: block; font-size: 22px; font-weight: 700; line-height: 1.15; }
    .st-gauge { height: 4px; border-radius: 2px; background: ${T.borderFaint2}; margin-top: 10px; overflow: hidden; }
    .st-gauge > div { height: 100%; border-radius: 2px; }
    .st-meta { font-size: 12.5px; color: ${T.text3}; margin-top: 6px; }

    .st-search-f input::-webkit-search-cancel-button { -webkit-appearance: none; display: none; }

    .st-ctrl-head > div { flex: 1 1 calc(100% - 40px) !important; }
    .st-ctrl-head > .sc-btn { flex: 1 1 0; justify-content: center; }

    .st-inv-scan { width: 100%; }
    /* Viseur plus bas que celui du scan simple : ici la liste compte autant que la caméra. */
    .sc-scan-sheet.st-inv .sc-scan-view { aspect-ratio: 16 / 10 !important; max-height: 34vh; max-height: 34dvh; min-height: 170px; }
    .st-inv-body { padding: 0 12px 12px !important; gap: 10px !important; }
    .st-inv-list { background: #fff; border-radius: 12px; padding: 4px 12px; }
    .st-inv-row { padding: 10px 0 !important; flex-wrap: wrap; row-gap: 8px !important; }
    .st-inv-txt { flex: 1 1 calc(100% - 56px) !important; }
    .st-inv-row > .st-inv-steps { margin-left: 46px; }
    .st-inv-row > .st-inv-gap { margin-left: auto; }
    .st-inv-row.last { background: ${BADGE.green.bg}; margin: 0 -12px; padding: 10px 12px !important; }
    .st-inv-foot { position: sticky; bottom: 0; margin-top: auto; background: #fff !important; padding: 10px 12px calc(10px + env(safe-area-inset-bottom)) !important; }
    .st-inv-foot > .sc-btn { flex: 1 1 100%; justify-content: center; }
    .st-inv-foot > span { font-size: 12px !important; }

    .st-ctrl-item { display: flex; gap: 12px; align-items: flex-start; padding: 12px 15px; border-bottom: 1px solid ${T.borderFaint}; cursor: pointer; }
    .st-ctrl-item input { width: 22px; height: 22px; margin-top: 1px; flex-shrink: 0; }
    .st-ctrl-nums { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; margin-top: 8px; }
    .st-ctrl-nums span { display: block; font-size: 11px; letter-spacing: .5px; text-transform: uppercase; color: ${T.muted}; font-weight: 600; }
    .st-ctrl-nums b { display: block; font-size: 15px; color: ${T.ink}; font-weight: 600; }
  }
`;

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

  /* Ce qui reste a ecrire, par produit. Deux gestes, deux ecritures :
     · « + » / « − » : une VARIATION, qui s'ajoute au stock reel — une
       expedition passee entre-temps n'est pas ecrasee ;
     · une valeur tapee : un COMPTAGE, pose tel quel (« j'en ai compte 7 »).
     L'ancienne version envoyait toujours la valeur affichee : un « + »
     apres une expedition remettait les unites parties. */
  const enAttente = useRef<Record<string, { delta: number; absolu: boolean; nom: string }>>({});
  /* Ecriture en cours, par produit : la suivante attend qu'elle finisse.
     Deux requetes en vol arrivaient dans n'importe quel ordre, et la plus
     ancienne pouvait ecraser la plus recente. */
  const enCours = useRef<Record<string, Promise<void>>>({});
  /* Derniere valeur confirmee par le serveur : c'est elle qu'on remet
     si une ecriture echoue (et non la valeur optimiste du clic d'avant). */
  const confirme = useRef<Record<string, number>>({});

  /* Controle du stock : theorique (recu - vendu) confronte a la base.
     Ne vaut que la ou des receptions existent — ailleurs le stock a ete
     saisi a la main et seul un comptage physique fait foi. */
  const [ctrlOpen, setCtrlOpen] = useState(false);
  const [ctrl, setCtrl] = useState<any>(null);
  const [ctrlSel, setCtrlSel] = useState<Set<string>>(new Set());
  const [ctrlBusy, setCtrlBusy] = useState(false);

  /* Téléphone : recherche, filtre par carte de synthèse, menu « ⋯ ».
     Le filtre lit le stock figé au premier geste : sans ça, passer un
     article en rupture de 0 à 1 le ferait disparaître sous le doigt. */
  const mobile = useIsMobile();
  const [q, setQ] = useState('');
  const [filtre, setFiltre] = useState<'' | 'out' | 'low' | 'ok'>('');
  const [stockGele, setStockGele] = useState<Record<string, number> | null>(null);
  const [plus, setPlus] = useState(false);
  const plusRef = useRef<HTMLButtonElement>(null);
  const [dernierScan, setDernierScan] = useState<string | null>(null);

  useEffect(() => {
    load();
    /* En quittant l'ecran (clic sur une fiche dans les 700 ms), ce qui
       attendait encore part tout de suite au lieu d'etre perdu. */
    const t = timers.current, attente = enAttente.current;
    return () => {
      Object.values(t).forEach(clearTimeout);
      Object.keys(attente).forEach(id => envoyer(id));
    };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

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
    const next = Math.max(0, base + delta);
    if (next !== base) ecrire(p, next, { delta: next - base });
  }

  /** Optimiste, puis temporisee : une variation (« + »/« − ») ou une
   *  valeur comptee (saisie). */
  function ecrire(p: Product, next: number, geste: { delta?: number; absolu?: boolean }) {
    if (next === (cibles.current[p.id] ?? p.stock ?? 0)) return;
    // Rien en attente : ce qui est affiche est ce que le serveur a confirme.
    if (cibles.current[p.id] === undefined) confirme.current[p.id] = p.stock ?? 0;
    cibles.current[p.id] = next;
    const lot = enAttente.current[p.id] || { delta: 0, absolu: false, nom: p.name_fr };
    if (geste.absolu) lot.absolu = true;
    else lot.delta += geste.delta || 0;
    enAttente.current[p.id] = lot;

    geler();
    setProducts(ps => ps.map(x => x.id === p.id ? { ...x, stock: next } : x));
    setSaving(s => new Set(s).add(p.id));

    clearTimeout(timers.current[p.id]);
    timers.current[p.id] = setTimeout(() => envoyer(p.id), 700);
  }

  /** Envoie ce qui attend pour un produit, apres l'ecriture precedente.
   *  Passe par /api/stock/movement : un mouvement journalise, motif
   *  « manual », delta ou comptage selon le geste. */
  function envoyer(id: string) {
    const precedente = enCours.current[id] || Promise.resolve();
    enCours.current[id] = precedente.then(async () => {
      const lot = enAttente.current[id];
      delete enAttente.current[id];
      if (!lot) return;
      const cible = cibles.current[id];
      if (!lot.absolu && !lot.delta) return;
      try {
        const res = await adminFetch('/api/stock/movement', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reason: 'manual',
            items: [lot.absolu
              ? { product_id: id, counted: cible, note: 'Comptage saisi sur l’écran Stocks' }
              : { product_id: id, delta: lot.delta, note: 'Ajustement +/− sur l’écran Stocks' }],
          }),
        });
        const d = await res.json().catch(() => ({}));
        // La route répond 200 avec ok:false quand le mouvement a échoué.
        if (!res.ok || d.ok === false) throw new Error();
        const apres = d.applied?.[0]?.after;
        confirme.current[id] = typeof apres === 'number' ? apres
          : lot.absolu ? cible : (confirme.current[id] ?? 0) + lot.delta;
      } catch {
        /* Échec : ce qui attendait encore pour ce produit est abandonné,
           et l'écran revient à la dernière valeur CONFIRMÉE plutôt que de
           mentir sur l'état réel du stock. */
        clearTimeout(timers.current[id]);
        delete enAttente.current[id];
        say(`Enregistrement impossible pour ${lot.nom}`);
      }
      /* Plus rien en attente : on affiche ce que dit le serveur (une
         expédition passée entre-temps y est comptée). */
      if (!enAttente.current[id]) {
        const vrai = confirme.current[id];
        delete cibles.current[id];
        if (typeof vrai === 'number') setProducts(ps => ps.map(x => x.id === id ? { ...x, stock: vrai } : x));
        setSaving(s => { const n = new Set(s); n.delete(id); return n; });
      }
    });
  }

  /* On fige l'ordre au premier geste, pas au chargement : tant qu'on
     lit, la liste doit rester triee par urgence. */
  const geler = () => {
    setOrdreGele(o => o || sorted.map(x => x.id));
    setStockGele(s => s || Object.fromEntries(products.map(x => [x.id, x.stock ?? 0])));
  };
  const reclasser = () => { setOrdreGele(null); setStockGele(null); setBrouillon({}); };

  /** Valide ce qui a ete tape dans une ligne. */
  function validerSaisie(p: Product) {
    const brut = brouillon[p.id];
    setBrouillon(b => { const n = { ...b }; delete n[p.id]; return n; });
    if (brut === undefined || brut === '') return;
    // Une valeur tapee est un comptage : elle se pose telle quelle.
    ecrire(p, Math.max(0, Math.round(Number(brut) || 0)), { absolu: true });
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
    /* Une box n'a pas de rayon : la compter posait un stock fantôme sur
       la box. Ce sont ses sachets qui se comptent. */
    if (Array.isArray(p.bundle_items) && p.bundle_items.length) {
      say(`${p.name_fr} est une box - compte ses sachets`); return;
    }
    const id = p.id;
    /* Trouvé par /api/scan mais absent de la liste chargée : sans cet
       ajout, la ligne était comptée et envoyée sans jamais s'afficher. */
    if (!products.some(x => x.id === id)) setProducts(ps => ps.some(x => x.id === id) ? ps : [...ps, p]);
    setInv(prev => ({ ...prev, [id]: (prev[id] || 0) + 1 }));
    setDernierScan(id);
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
      /* La route répond 200 même quand une partie des lignes a échoué
         (`failed`) : la session se fermait sur « N références ajustées »
         et les comptages refusés disparaissaient. Ils restent à l'écran,
         seuls, pour être revalidés. */
      const refuses: string[] = Array.isArray(d.failed) ? d.failed : [];
      if (refuses.length) {
        setInv(s => Object.fromEntries(Object.entries(s).filter(([id]) => refuses.includes(id))));
        say(`${(d.applied || []).length} reference(s) ajustee(s) · ${refuses.length} en echec, a revalider`);
      } else {
        say(`${(d.applied || []).length} reference(s) ajustee(s)`);
        setInv({}); setInvOpen(false);
      }
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
    { label: 'Ruptures',        value: num(out.length),     tone: BADGE.red,    icon: 'error',        f: 'out' as const },
    { label: 'Stock bas',       value: num(low.length),     tone: BADGE.orange, icon: 'warning',      f: 'low' as const },
    { label: 'Stock sain',      value: num(healthy.length), tone: BADGE.green,  icon: 'check_circle', f: 'ok' as const },
    { label: 'Valeur du stock', value: eur(stockValue),     tone: null,         icon: 'euro',         f: null },
  ];

  /* Recherche et filtre du téléphone. Sur ordinateur, q et filtre
     restent vides : la liste est celle d'avant. */
  const visibles = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle && !filtre) return affichees;
    return affichees.filter(p => {
      const s = stockGele?.[p.id] ?? (p.stock ?? 0);
      const thr = p.stock_alert ?? LOW;
      if (filtre === 'out' && s > 0) return false;
      if (filtre === 'low' && !(s > 0 && s <= thr)) return false;
      if (filtre === 'ok' && !(s > thr)) return false;
      if (needle && !`${p.name_fr} ${nomProduit(p, lang)} ${refOf(p)} ${(p as any).ean || ''}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [affichees, q, filtre, stockGele, lang]);

  /** Champ de quantité, partagé par la table et les cartes. */
  const champQuantite = (p: Product, qty: number, color: string, mobileField: boolean) => (
    <input
      className={`sc-input sc-num${mobileField ? ' st-qty' : ''}`}
      inputMode="numeric"
      pattern="[0-9]*"
      enterKeyHint="done"
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
      style={mobileField ? { color } : {
        width: 52, height: 28, padding: '0 4px', textAlign: 'center',
        fontSize: 12.5, fontWeight: 700, color,
      }} />
  );

  const inventaire = Object.entries(inv);
  /* Téléphone : le dernier scanné en tête, au plus près du viseur. */
  const inventaireAffiche = mobile ? [...inventaire].reverse() : inventaire;

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

  const basculerControle = () => { const n = !ctrlOpen; setCtrlOpen(n); if (n && !ctrl) loadCtrl(); };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="sc-head">
        <div>
          <div className="sc-title">{t('titre')}</div>
          <div className="sc-sub">{t('sous')}</div>
        </div>
        {mobile ? (
          /* Téléphone : l'inventaire par scan d'abord, le reste dans « ⋯ ». */
          <div className="sc-actions">
            <button className="sc-btn" onClick={() => setInvOpen(v => !v)}
                    style={{ background: '#F3EDF3', color: '#6E4470', border: '1px solid #E3D6E3' }}>
              <span className="ms">barcode_scanner</span>{t('invScan')}
            </button>
            <button ref={plusRef} className="sc-btn sc-btn-secondary st-plus" aria-label={t('plusActions')}
                    aria-haspopup="menu" aria-expanded={plus} onClick={() => setPlus(v => !v)}>
              <span className="ms">more_horiz</span>
            </button>
            <MenuActions open={plus} anchor={plusRef.current} onClose={() => setPlus(false)}>
              <MenuItem icon="fact_check" label={t('controle')} onClick={basculerControle} />
              <MenuItem icon="history" label={t('historique')} href="/admin/stock/historique" />
              <MenuItem icon="shopping_basket" label={t('cmdAchat')} href="/admin/achats" />
              <MenuItem icon="download" label={t('exporter')} onClick={exportCsv} />
            </MenuActions>
          </div>
        ) : (
          <div className="sc-actions">
            <Link href="/admin/achats" className="sc-btn sc-btn-secondary"><span className="ms">shopping_basket</span>{t('cmdAchat')}</Link>
            <button className="sc-btn" onClick={() => setInvOpen(v => !v)}
                    style={{ background: '#F3EDF3', color: '#6E4470', border: '1px solid #E3D6E3' }}>
              <span className="ms">barcode_scanner</span>{t('invScan')}
            </button>
            <button className="sc-btn sc-btn-secondary" onClick={basculerControle}>
              <span className="ms">fact_check</span>{t('controle')}
            </button>
            <Link className="sc-btn sc-btn-secondary" href="/admin/stock/historique">
              <span className="ms">history</span>{t('historique')}
            </Link>
            <button className="sc-btn sc-btn-secondary" onClick={exportCsv}><span className="ms">download</span>{t('exporter')}</button>
          </div>
        )}
      </div>
      {/* Controle du stock : recu - vendu confronte a la base */}
      {ctrlOpen && (
        <div className="sc-card" style={{ marginBottom: 12, overflow: 'hidden' }}>
          <div className="st-ctrl-head" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 15px', background: T.surfaceAlt, flexWrap: 'wrap' }}>
            <span className="ms" style={{ fontSize: 19, color: T.muted }}>fact_check</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>{t('controleTitre')}</div>
              <div style={{ fontSize: 11, color: T.text3 }}>
                Th&eacute;orique = total re&ccedil;u &minus; total exp&eacute;di&eacute;, recalcul&eacute; depuis les r&eacute;ceptions et les commandes parties.
              </div>
            </div>
            <button className="sc-btn sc-btn-secondary st-mini" onClick={loadCtrl} disabled={ctrlBusy}>{t('recalculer')}</button>
            <button className="sc-btn sc-btn-secondary st-mini" onClick={() => setCtrlOpen(false)}>{tc('close')}</button>
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

              {mobile ? (
                /* Téléphone : une carte par produit, toute la carte coche. */
                <div>
                  {ctrl.rows.filter((r: any) => r.ecart !== 0 || !r.reconciliable).map((r: any) => {
                    const cochable = r.reconciliable && r.ecart !== 0;
                    const contenu = (
                      <>
                        {cochable ? (
                          <input type="checkbox" checked={ctrlSel.has(r.product_id)} style={{ accentColor: 'var(--accent)' }}
                                 onChange={() => setCtrlSel(prev => {
                                   const n = new Set(prev);
                                   if (n.has(r.product_id)) n.delete(r.product_id); else n.add(r.product_id);
                                   return n;
                                 })} />
                        ) : (
                          <span className="ms" style={{ fontSize: 22, color: T.muted, flexShrink: 0 }}>help</span>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                            <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600, color: T.ink }}>{r.name}</span>
                            <span className="sc-num" style={{ fontSize: 17, fontWeight: 700, color: r.ecart === 0 ? T.muted : r.ecart > 0 ? T.red : T.blue }}>
                              {r.reconciliable ? (r.ecart > 0 ? `+${r.ecart}` : r.ecart) : '—'}
                            </span>
                          </div>
                          {!r.reconciliable && (
                            <div style={{ fontSize: 12.5, color: T.muted, marginTop: 2 }}>{t('comptageRequis')}</div>
                          )}
                          <div className="st-ctrl-nums sc-num">
                            <div><span>{t('recu')}</span><b>{r.received}</b></div>
                            <div><span>{t('vendu')}</span><b>{r.sold}</b></div>
                            <div><span>{t('theorique')}</span><b>{r.reconciliable ? r.theorique : '—'}</b></div>
                            <div><span>{t('enBase')}</span><b>{r.base}</b></div>
                          </div>
                        </div>
                      </>
                    );
                    return cochable
                      ? <label key={r.product_id} className="st-ctrl-item">{contenu}</label>
                      : <div key={r.product_id} className="st-ctrl-item" style={{ opacity: 0.7, cursor: 'default' }}>{contenu}</div>;
                  })}
                </div>
              ) : (
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
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 15px', background: T.surfaceAlt, flexWrap: 'wrap' }}>
                <span style={{ fontSize: mobile ? 12.5 : 11.5, color: T.muted, flex: mobile ? '1 1 100%' : 1 }}>
                  L&rsquo;alignement cr&eacute;e un mouvement dat&eacute; et motiv&eacute; par produit. Les lignes gris&eacute;es ne sont pas calculables.
                </span>
                <button className="sc-btn sc-btn-green" onClick={applyCtrl} disabled={ctrlBusy || !ctrlSel.size}
                        style={mobile ? { flex: '1 1 100%', justifyContent: 'center' } : undefined}>
                  <span className="ms">check_circle</span>{ctrlBusy ? 'Alignement\u2026' : `Aligner ${ctrlSel.size} produit(s)`}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Session d'inventaire par scan */}
      {/* Sur téléphone, .sc-scan-sheet passe la session en plein écran :
          viseur en haut, articles comptés dessous (le dernier en tête),
          « Ajuster le stock » collé en bas. Sur ordinateur, la classe
          n'a aucun effet. */}
      {invOpen && (
        <div className="sc-card sc-scan-sheet st-inv" style={{ border: '1px solid #E3D6E3', marginBottom: 12, overflow: 'hidden' }}>
          <div className="sc-scan-sheet-head">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="sc-scan-sheet-title">{t('session')}</div>
              <div className="sc-scan-sheet-sub">{inventaire.length} {t('refsComptees')}</div>
            </div>
            <button onClick={() => setInvOpen(false)} aria-label={tc('close')}>
              <span className="ms" style={{ fontSize: 26 }}>close</span>
            </button>
          </div>

          <div className="sc-hide-mobile" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 15px', background: '#F9F5F9', flexWrap: 'wrap' }}>
            <span className="ms" style={{ fontSize: 19, color: '#6E4470' }}>inventory</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#5E3B5E' }}>{t('session')}</div>
              <div style={{ fontSize: 11, color: '#6E4470' }}>
                {Object.keys(inv).length} r&eacute;f&eacute;rence(s) compt&eacute;e(s) &middot; scanne chaque produit puis corrige la quantit&eacute;
              </div>
            </div>
            <button className="sc-btn sc-btn-secondary st-mini" onClick={() => setInv({})}>{t('vider')}</button>
            <button className="sc-btn sc-btn-secondary st-mini" onClick={() => setInvOpen(false)}>{tc('close')}</button>
          </div>

          <div className="st-inv-body" style={{ display: 'flex', gap: 12, padding: 15, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div className="st-inv-scan">
              <BarcodeScanner compact onScan={onInvScan} label="Scanne un produit" autoStart={mobile} />
            </div>

            <div className="st-inv-list" style={{ flex: '1 1 300px', minWidth: 0 }}>
              {mobile && inventaire.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: `1px solid ${T.borderFaint}` }}>
                  <span style={{ flex: 1, fontSize: 13, color: T.text2b }}>{inventaire.length} {t('refsComptees')}</span>
                  <button className="sc-btn sc-btn-secondary st-mini" onClick={() => setInv({})}>{t('vider')}</button>
                </div>
              )}
              {inventaire.length === 0 ? (
                <div style={{
                  border: `1px dashed ${T.borderField}`, borderRadius: 9, padding: '28px 18px',
                  textAlign: 'center', fontSize: mobile ? 13.5 : 12, color: T.muted, margin: mobile ? '8px 0' : 0,
                }}>
                  Aucun article compt&eacute; pour l&rsquo;instant. Scanne un premier produit pour d&eacute;marrer la session.
                </div>
              ) : (
                inventaireAffiche.map(([id, counted]) => {
                  const p = products.find(x => x.id === id);
                  if (!p) return null;
                  const theo = p.stock ?? 0;
                  const gap = counted - theo;
                  const dernier = mobile && id === dernierScan;
                  return (
                    <div key={id} className={`st-inv-row${dernier ? ' last' : ''}`}
                         style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: `1px solid ${T.borderFaint}` }}>
                      {p.image_url
                        ? <img src={p.image_url} alt="" style={thumbStyle(p.name_fr, mobile ? 36 : 28)} />
                        : <div style={thumbStyle(p.name_fr, mobile ? 36 : 28)}>{initials(p.name_fr, 1)}</div>}
                      <div className="st-inv-txt" style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: mobile ? 14.5 : 12.5, fontWeight: mobile ? 600 : 400, color: T.ink }}>{nomProduit(p, lang)}</div>
                        <div className="sc-num" style={{ fontSize: mobile ? 12.5 : 10.5, color: T.muted }}>{refOf(p)} &middot; th&eacute;orique {theo}</div>
                      </div>
                      <div className="st-inv-steps" style={{ display: 'flex', alignItems: 'center', gap: mobile ? 6 : 5 }}>
                        <button className={mobile ? 'st-step' : 'sc-iconbtn'} style={mobile ? undefined : { width: 28, height: 28 }}
                                onClick={() => setInv(s => ({ ...s, [id]: Math.max(0, (s[id] || 0) - 1) }))} aria-label={t('moins')}>
                          <span className="ms">remove</span>
                        </button>
                        <span className="sc-num" style={{ fontSize: mobile ? 19 : 13, fontWeight: 700, minWidth: mobile ? 34 : 26, textAlign: 'center' }}>{counted}</span>
                        <button className={mobile ? 'st-step' : 'sc-iconbtn'} style={mobile ? undefined : { width: 28, height: 28 }}
                                onClick={() => setInv(s => ({ ...s, [id]: (s[id] || 0) + 1 }))} aria-label="Plus">
                          <span className="ms">add</span>
                        </button>
                      </div>
                      <span className="sc-num st-inv-gap" title={t('ecart')} style={{
                        minWidth: 44, textAlign: 'right', fontSize: mobile ? 15 : 12.5, fontWeight: 600,
                        color: gap === 0 ? T.muted : gap > 0 ? T.blue : T.red,
                      }}>{gap > 0 ? `+${gap}` : gap}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="st-inv-foot" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 15px', background: T.surfaceAlt, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11.5, color: T.muted, flex: 1 }}>
              Les &eacute;carts cr&eacute;ent un mouvement de stock dat&eacute; et sign&eacute;.
            </span>
            <button className="sc-btn sc-btn-green" onClick={applyInventory} disabled={invBusy || !Object.keys(inv).length}>
              <span className="ms">check_circle</span>{invBusy ? 'Ajustement...' : t('ajusterStock')}
            </button>
          </div>
        </div>
      )}

      {/* 4 cartes de synthese — sur téléphone, les trois premières filtrent la liste */}
      <div className="st-kpis">
        {mobile ? CARDS.map(c => {
          const fg = c.tone ? c.tone.fg : T.ink;
          const corps = (
            <>
              <span className="st-kpi-l" style={{ color: c.tone ? c.tone.fg : T.muted }}>
                <span className="ms" style={{ fontSize: 17 }}>{c.icon}</span>{c.label}
              </span>
              <span className="sc-num st-kpi-v" style={{ display: 'block', color: fg }}>{c.value}</span>
            </>
          );
          const fond = { background: c.tone ? c.tone.bg : '#fff', border: `1px solid ${c.tone ? c.tone.fg + '22' : T.border}`, color: fg };
          return c.f ? (
            <button key={c.label} type="button" className="st-kpi" style={fond} aria-pressed={filtre === c.f}
                    onClick={() => setFiltre(f => f === c.f ? '' : c.f!)}>{corps}</button>
          ) : (
            <div key={c.label} className="st-kpi" style={{ ...fond, cursor: 'default' }}>{corps}</div>
          );
        }) : CARDS.map(c => (
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

      {/* Recherche collée en haut de la zone qui défile (téléphone) */}
      {mobile && !loading && sorted.length > 0 && (
        <div className="st-search">
          <div className="st-search-f">
            <span className="ms">search</span>
            <input className="sc-input" type="search" inputMode="search" enterKeyHint="search"
                   placeholder={t('rechercher')} aria-label={t('rechercher')}
                   value={q} onChange={e => setQ(e.target.value)} />
            {q && (
              <button className="sc-iconbtn" onClick={() => setQ('')} aria-label={t('effacer')}>
                <span className="ms">close</span>
              </button>
            )}
          </div>
        </div>
      )}

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
          <span style={{ fontSize: mobile ? 13 : 12, color: T.text2b, flex: 1 }}>{t('ordreGele')}</span>
          <button className="sc-btn sc-btn-secondary" style={mobile ? undefined : { padding: '4px 11px', fontSize: 11.5 }}
                  onClick={reclasser}>
            <span className="ms" style={mobile ? undefined : { fontSize: 15 }}>sort</span>{t('reclasser')}
          </button>
        </div>
      )}

      {/* ── Téléphone : une carte par article, pas-à-pas au pouce ── */}
      {mobile && !loading && sorted.length > 0 && (
        visibles.length === 0 ? (
          <div className="sc-card sc-empty">{t('aucunFiltre')}</div>
        ) : (
          <div className="sc-card" style={{ overflow: 'hidden' }}>
            {visibles.map(p => {
              const qty = p.stock ?? 0;
              const dus = reserve[p.id] || 0;
              const dispo = qty - dus;
              const thr = p.stock_alert ?? LOW;
              const gaugeMax = Math.max(qty, thr * 4, 1);
              const color = stockColor(qty, thr);
              const nom = nomProduit(p, lang);
              return (
                <div key={p.id} className="st-item">
                  <div className="st-item-top">
                    <Link href={`/admin/produits/${p.id}`} className="st-item-link">
                      {p.image_url
                        ? <img src={p.image_url} alt="" style={thumbStyle(p.name_fr, 40)} />
                        : <div style={thumbStyle(p.name_fr, 40)}>{initials(p.name_fr, 1)}</div>}
                      <span style={{ minWidth: 0 }}>
                        <span className="st-item-name">{nom}</span>
                        <span className="st-item-ref">{refOf(p)} · {catName(p.category_id)}</span>
                      </span>
                    </Link>
                    <Link className="sc-iconbtn" aria-label={`${t('historiqueDe')} — ${nom}`} style={{ textDecoration: 'none' }}
                          href={`/admin/stock/historique?produit=${p.id}`}>
                      <span className="ms">history</span>
                    </Link>
                  </div>
                  <div className="st-item-row">
                    <div className="st-stepper">
                      <button className="st-step" onClick={() => adjust(p, -1)} aria-label={`− ${nom}`} disabled={qty <= 0}>
                        <span className="ms">remove</span>
                      </button>
                      {champQuantite(p, qty, color, true)}
                      <button className="st-step" onClick={() => adjust(p, +1)} aria-label={`+ ${nom}`}>
                        <span className="ms">add</span>
                      </button>
                    </div>
                    <div className="st-dispo">
                      <span className="st-dispo-k">{t('disponible')}</span>
                      <span className="sc-num st-dispo-v" style={{ color: dispo <= 0 ? T.red : dispo <= thr ? '#8A5B08' : T.ink }}>{dispo}</span>
                    </div>
                  </div>
                  <div className="st-gauge"><div style={{ width: `${Math.min(100, (qty / gaugeMax) * 100)}%`, background: color }} /></div>
                  <div className="st-meta sc-num">
                    <span style={{ color: dus > 0 ? '#8A5B08' : undefined }}>{t('reserve')} {dus > 0 ? dus : '—'}</span>
                    {' · '}{t('seuil')} {thr}
                    {' · '}{t('valeur')} {p.cost_price ? eur((Number(p.cost_price) || 0) * qty) : '—'}
                    {saving.has(p.id) && <span style={{ color: T.muted }}> · {t('enregistrement')}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {!mobile && !loading && sorted.length > 0 && (
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
                          {champQuantite(p, qty, color, false)}
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

      {toast && <div className="sc-toast" role="status">{toast}</div>}
    </>
  );
}
