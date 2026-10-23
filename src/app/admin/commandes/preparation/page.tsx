'use client';
import { useEffect, useMemo, useState } from 'react';
import { adminFetch } from '@/lib/auth-client';
import { T, BADGE, thumbStyle, initials, eur } from '@/lib/admin-theme';
import BarcodeScanner from '@/components/BarcodeScanner';
import { useT } from '@/lib/admin-i18n';
import { useIsMobile } from '@/lib/use-mobile';
import { TP, nomProduit } from './i18n';
import { SqueletteTable } from '@/components/Squelette';

/* ═══════════════════════════════════════════════════════════════
   BOUTIQUE › PRÉPARATION DE COMMANDE
   Handoff v2 §2.1 : file d'attente, bandeau de session avec barre de
   progression, viseur + zone de retour, liste des articles à prélever.

   Règles métier imposées :
   · un scan hors commande n'incrémente rien et affiche l'erreur ;
   · un scan au-delà de la quantité attendue est plafonné ;
   · la validation décrémente le stock et passe la commande en expédiée.

   Téléphone (on prépare une main sur le carton) : file d'attente en
   rangée de puces, scanner plein écran à la demande, lignes à grosses
   cibles (le rond coche la ligne entière), validation collée en bas.
   ═══════════════════════════════════════════════════════════════ */

type Order = {
  id: string; order_number: string; status: string; customer_name?: string;
  lines: any; created_at: string; picking?: Record<string, number>;
  /** Cumul deja expedie, par produit. Alimente le calcul du reliquat. */
  shipped_qty?: Record<string, number>;
};
type PickLine = {
  product_id: string; name: string; ean?: string; image_url?: string; ref?: string;
  /** Quantite commandee a l'origine. */
  commande: number;
  /** Deja parti lors d'une expedition precedente. */
  dejaExpedie: number;
  /** Ce qu'il reste a prelever aujourd'hui. */
  qty: number;
  /** Box (migration 054) : ce qu'il faut mettre dans chaque carton. */
  contenu?: Array<{ name: string; qty: number }>;
};

/** Composition d'une box telle que renvoyée par l'API (tableau ou JSON). */
const lireLot = (v: any): Array<{ product_id: string; qty: number }> => {
  let x = v;
  if (typeof x === 'string') { try { x = JSON.parse(x); } catch { x = null; } }
  return Array.isArray(x) ? x.filter((b: any) => b?.product_id && Number(b.qty) > 0) : [];
};

/* Une commande partiellement expediee revient dans la file : c'est la
   qu'on prepare son reliquat quand le reassort arrive. */
const PAID = ['paid', 'confirmed', 'preparing', 'partial'];

/* Valeurs d'ordinateur = anciens styles en ligne ; seul le bloc
   « téléphone » change quelque chose. */
const CSS = `
  .p-line { display:flex; align-items:center; gap:10px; padding:10px 15px; border-bottom:1px solid ${T.borderFaint}; }
  .p-check { width:30px; height:30px; border-radius:50%; flex-shrink:0; display:flex; align-items:center; justify-content:center; border:none; padding:0; cursor:pointer; }
  .p-check .ms { font-size:17px; }
  .p-info { flex:1; min-width:0; }
  .p-name { font-size:12.5px; color:${T.ink}; }
  .p-meta { font-size:10.5px; color:${T.muted}; }
  .p-box { margin-top:5px; padding:6px 8px; background:#F6F3EC; border-radius:6px; font-size:11px; color:${T.text2}; line-height:1.55; }
  .p-qty { display:flex; align-items:center; gap:5px; }
  .p-qty .sc-iconbtn { width:28px; height:28px; }
  .p-count { font-size:12.5px; font-weight:700; min-width:40px; text-align:center; }
  .sc-btn.p-btn-xs { padding:5px 10px; font-size:11px; }
  @media (max-width: 899px) {
    .p-line { flex-wrap:wrap; padding:12px 12px 10px; gap:10px 12px; }
    .p-check { width:44px; height:44px; }
    .p-check .ms { font-size:24px; }
    .p-name { font-size:15px; line-height:1.3; }
    .p-meta { font-size:12px; margin-top:2px; }
    .p-box { font-size:13px; }
    .p-qty { flex:1 0 100%; justify-content:flex-end; gap:8px; }
    .p-qty .sc-iconbtn { width:48px; height:44px; border:1px solid ${T.borderField}; background:#fff; color:${T.ink}; }
    .p-count { font-size:17px; min-width:64px; }
    .sc-btn.p-btn-xs { padding:10px 12px; font-size:13px; }
    .p-queue-chip { flex-direction:column; align-items:flex-start !important; justify-content:center; gap:0 !important; height:auto !important; min-height:48px; padding:5px 14px !important; line-height:1.2; }
    .p-queue-chip small { font-size:11.5px; font-weight:400; opacity:.75; }
  }
`;

export default function PreparationPage() {
  const { t, tc, lang } = useT(TP);
  const mobile = useIsMobile();
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [feedback, setFeedback] = useState<{ ok: boolean; title: string; detail: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [scanOpen, setScanOpen] = useState(false);

  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3500); };

  useEffect(() => {
    (async () => {
      try {
        const [o, p] = await Promise.all([
          adminFetch('/api/orders').then(r => r.json()).catch(() => ({})),
          adminFetch('/api/products?limit=1000').then(r => r.json()).catch(() => ({})),
        ]);
        const queue = (o.orders || []).filter((x: Order) => !((x as any).is_test) && PAID.includes(x.status));
        setOrders(queue);
        setProducts(p.products || []);
        /* Ouverte depuis une commande (« Préparer ») : c'est elle qu'on
           prépare, pas la première de la file. */
        const voulue = new URLSearchParams(window.location.search).get('id');
        const premiere = (voulue && queue.find((x: Order) => x.id === voulue)) || queue[0];
        if (premiere) selectOrder(premiere);
      } finally { setLoading(false); }
    })();
  }, []);

  function selectOrder(o: Order) {
    setActiveId(o.id);
    setPicked(o.picking && typeof o.picking === 'object' ? { ...o.picking } : {});
    setFeedback(null);
  }

  const active = orders.find(o => o.id === activeId) || null;

  /* Téléphone : la puce de la commande en cours reste visible dans la
     rangée (ouverte depuis une commande plus bas dans la file). */
  useEffect(() => {
    if (!mobile || !activeId) return;
    const el = document.querySelector('.p-queue-chip.on') as HTMLElement | null;
    const row = el?.parentElement;
    if (el && row) {
      const d = el.getBoundingClientRect().left - row.getBoundingClientRect().left;
      row.scrollLeft += d - (row.clientWidth - el.offsetWidth) / 2;
    }
  }, [mobile, activeId, loading]);

  const lines: PickLine[] = useMemo(() => {
    if (!active) return [];
    let raw: any[] = [];
    try { raw = typeof active.lines === 'string' ? JSON.parse(active.lines) : (active.lines || []); } catch { raw = []; }
    const deja = active.shipped_qty || {};
    return raw.filter(l => l.product_id).map(l => {
      const p = products.find(x => x.id === l.product_id);
      const commande = Number(l.qty) || 1;
      const dejaExpedie = Math.min(commande, Number(deja[l.product_id]) || 0);
      return {
        product_id: l.product_id,
        name: nomProduit(l, p, lang),
        commande,
        dejaExpedie,
        // Sur un reliquat, on ne represente que ce qui reste a envoyer.
        qty: commande - dejaExpedie,
        ean: p?.ean || undefined,
        image_url: l.image_url || p?.image_url,
        ref: p?.sort_order ? `SC-${String(p.sort_order).padStart(4, '0')}` : undefined,
        contenu: lireLot(p?.bundle_items).map(b => {
          const c = products.find(x => x.id === b.product_id);
          return { name: c ? nomProduit({}, c, lang) : b.product_id, qty: Number(b.qty) };
        }),
      };
    }).filter(l => l.qty > 0);
  }, [active, products, lang]);

  const totalQty = lines.reduce((s, l) => s + l.qty, 0);
  const doneQty = lines.reduce((s, l) => s + Math.min(l.qty, picked[l.product_id] || 0), 0);
  const pct = totalQty ? Math.round((doneQty / totalQty) * 100) : 0;
  const complete = totalQty > 0 && doneQty >= totalQty;
  /* Il y a de quoi expedier, mais pas tout : c'est le cas du reliquat. */
  const partiel = doneQty > 0 && !complete;
  const resteApres = totalQty - doneQty;
  const enReliquat = lines.some(l => l.dejaExpedie > 0);

  /** Scan : déduplication et plafonnement dans la mise à jour fonctionnelle. */
  function onScan(code: string) {
    const line = lines.find(l => l.ean && l.ean === code);
    if (!line) {
      setFeedback({ ok: false, title: t('horsCmd'), detail: `EAN ${code} — ${t('horsCmdD')} ${active?.order_number || ''}` });
      try { navigator.vibrate?.([70, 60, 70]); } catch {}
      return;
    }
    setPicked(prev => {
      const current = prev[line.product_id] || 0;
      if (current >= line.qty) {
        setFeedback({ ok: false, title: t('dejaAtteint'), detail: `${line.name} — ${line.qty} / ${line.qty}` });
        return prev;
      }
      const next = current + 1;
      setFeedback({ ok: true, title: line.name, detail: `${next} / ${line.qty}${line.ref ? ' · ' + line.ref : ''}` });
      return { ...prev, [line.product_id]: next };
    });
  }

  const adjust = (l: PickLine, d: number) =>
    setPicked(p => ({ ...p, [l.product_id]: Math.max(0, Math.min(l.qty, (p[l.product_id] || 0) + d)) }));
  /* Le rond de la ligne : tout prélevé d'un coup, ou retour à zéro.
     Même effet que d'appuyer « + » autant de fois qu'il faut. */
  const toggleLine = (l: PickLine) =>
    setPicked(p => ({ ...p, [l.product_id]: (p[l.product_id] || 0) >= l.qty ? 0 : l.qty }));

  async function saveProgress() {
    if (!active) return;
    try {
      await adminFetch(`/api/orders/${active.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ picking: picked }),
      });
    } catch { /* la reprise de session est un confort */ }
  }

  /**
   * Expedie ce qui est dans le carton.
   *
   * `tout` distingue les deux gestes : l'expedition complete solde la
   * commande, l'expedition partielle cree le reliquat et la laisse dans
   * la file. Dans les deux cas le stock se decremente sur ce qui PART
   * reellement — l'ancien code retirait la quantite COMMANDEE, ce qui
   * aurait fait disparaitre du stock des articles restes en rayon des
   * lors que l'envoi partiel devenait possible.
   */
  async function expedier(tout: boolean) {
    if (!active || (tout ? !complete : !partiel)) return;

    /* Les quantités s'ADDITIONNENT par produit. Un remplacement de
       rupture ajoute une seconde ligne sur la même référence, et
       `Object.fromEntries` ne garde alors que la dernière — la première
       ne partait jamais. */
    const colis: Record<string, number> = {};
    for (const l of lines) {
      const n = Math.min(l.qty, picked[l.product_id] || 0);
      if (n > 0) colis[l.product_id] = (colis[l.product_id] || 0) + n;
    }

    if (!tout) {
      const manque = lines
        .filter(l => (picked[l.product_id] || 0) < l.qty)
        .map(l => `${l.name} — ${l.qty - (picked[l.product_id] || 0)}`);
      if (!window.confirm(`${t('confirmReliquat')}\n\n${manque.join('\n')}`)) return;
    }

    setBusy(true);
    try {
      /* Un SEUL appel : le serveur sort le stock et solde la commande.

         Avant, cet écran enchaînait lui-même les écritures de stock puis
         la mise à jour de la commande. Quand la seconde échouait, le
         stock était déjà parti : l'opérateur voyait « échec »,
         recommençait, et le stock sortait une deuxième fois. SD-0107 le
         17/08 et SD-0105 le 20/08 y sont passées — 6 unités perdues.

         Le serveur plafonne le colis à ce qui reste réellement dû, relu
         en base. Relancer après un échec est donc sans danger : il n'y a
         plus rien à retirer. */
      const res = await adminFetch(`/api/orders/${active.id}/expedier`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ colis, tout }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) throw new Error(data?.error || '');

      const cumul = data.shipped_qty || {};
      /* Le serveur tranche le statut sur l'état réel : il sait ce qui
         reste dû, l'écran ne fait que l'afficher. */
      tout = data.statut === 'shipped';
      if (data.rejeu) say(t('dejaExpedie'));

      if (tout) {
        if (!data.rejeu) say(`${active.order_number} ${t('expediee')}`);
        setOrders(os => os.filter(o => o.id !== active.id));
        const rest = orders.filter(o => o.id !== active.id);
        if (rest.length) selectOrder(rest[0]); else { setActiveId(null); setPicked({}); }
      } else {
        /* La commande RESTE dans la file : le reliquat s'y prepare quand
           le reassort arrive. Rien n'est envoye automatiquement. */
        say(`${active.order_number} — ${t('reliquatCree')} (${resteApres})`);
        const maj = { ...active, status: 'partial', shipped_qty: cumul };
        setOrders(os => os.map(o => o.id === active.id ? maj : o));
        setPicked({});
        setFeedback(null);
      }
    } catch { say(t('echecValid')); }
    finally { setBusy(false); }
  }

  const finish = () => expedier(true);

  /* ── Morceaux communs ordinateur / téléphone ───────────────── */
  const feedbackBox = feedback && (
    <div role="status" style={{
      display: 'flex', alignItems: 'flex-start', gap: 9, padding: '12px 14px', borderRadius: 9,
      background: feedback.ok ? '#F1F6EF' : '#FDF0EE',
      border: `1px solid ${feedback.ok ? '#CFE0C8' : '#EFC3BC'}`,
      marginBottom: mobile ? 0 : 10,
    }}>
      <span className="ms" style={{ fontSize: mobile ? 22 : 19, color: feedback.ok ? '#3E5238' : '#B03A2E' }}>
        {feedback.ok ? 'check_circle' : 'error'}
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: mobile ? 15 : 13.5, fontWeight: 700, color: feedback.ok ? '#3E5238' : '#B03A2E' }}>{feedback.title}</div>
        <div style={{ fontSize: mobile ? 13 : 11.5, color: T.text2b }}>{feedback.detail}</div>
      </div>
    </div>
  );

  const progressBar = (
    <div style={{ height: mobile ? 9 : 7, borderRadius: 5, background: T.borderFaint2, marginTop: 10, overflow: 'hidden' }}>
      <div style={{
        height: '100%', width: `${pct}%`, borderRadius: 5,
        background: complete ? T.green : 'var(--accent)', transition: 'width .2s',
      }} />
    </div>
  );

  const linesCard = active && (
    <div className="sc-card" style={{ overflow: 'hidden' }}>
      <div style={{ padding: '12px 15px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="sc-card-title">{t('aPrelever')}</span>
        <span style={{ flex: 1 }} />
        <button className="sc-btn sc-btn-secondary p-btn-xs" onClick={saveProgress}>
          {t('enregAvanc')}
        </button>
      </div>
      {lines.length === 0 && <div className="sc-empty">{t('aucuneLigne')}</div>}
      {lines.map(l => {
        const got = picked[l.product_id] || 0;
        const done = got >= l.qty;
        return (
          <div key={l.product_id} className="p-line" style={{
            borderLeft: `3px solid ${done ? T.green : 'transparent'}`,
            background: done ? '#FAFCF9' : undefined,
          }}>
            <button type="button" className="p-check" onClick={() => toggleLine(l)}
                    aria-pressed={done} aria-label={`${l.name} — ${done ? t('decocher') : t('cocher')}`}
                    style={{ background: done ? T.green : T.borderFaint2 }}>
              <span className="ms" style={{ color: done ? '#fff' : T.muted3 }}>check</span>
            </button>
            {l.image_url
              ? <img src={l.image_url} alt="" style={thumbStyle(l.name, mobile ? 44 : 34)} />
              : <div style={thumbStyle(l.name, mobile ? 44 : 34)}>{initials(l.name, 1)}</div>}
            <div className="p-info">
              <div className="p-name">{l.name}</div>
              <div className="sc-num p-meta">
                {[l.ref, l.ean ? `EAN ${l.ean}` : t('sansEan')].filter(Boolean).join(' · ')}
              </div>
              {!!l.contenu?.length && (
                <div className="p-box">
                  <b>Box — à mettre dans chaque carton :</b>
                  {l.contenu.map((c, i) => <div key={i}>{c.qty} × {c.name}</div>)}
                </div>
              )}
            </div>
            <div className="p-qty">
              <button className="sc-iconbtn" onClick={() => adjust(l, -1)} aria-label={t('moins')} disabled={got <= 0}>
                <span className="ms">remove</span>
              </button>
              <span className="sc-num p-count" style={{ color: done ? T.green : T.ink }}>
                {got} / {l.qty}
              </span>
              <button className="sc-iconbtn" onClick={() => adjust(l, +1)} aria-label={t('plus')} disabled={done}>
                <span className="ms">add</span>
              </button>
            </div>
          </div>
        );
      })}
      {lines.some(l => !l.ean) && (
        <div style={{ padding: '10px 15px', background: '#FDF6EA', fontSize: mobile ? 13 : 11.5, color: '#8A5B08' }}>
          {t('avertEan')}
        </div>
      )}
    </div>
  );

  /* Carte d'état à côté du scanner : emballage, envoi partiel ou mode
     d'emploi. Sur téléphone, les boutons d'expédition sont dans la
     barre du bas : la carte garde seulement l'explication. */
  const stateCard = active && (complete ? (
    <div className="sc-card" style={{ borderColor: '#CFE0C8', padding: '13px 15px' }}>
      <div className="sc-card-title" style={{ color: '#3E5238', marginBottom: 8 }}>{t('emballage')}</div>
      <div style={{ fontSize: mobile ? 13 : 11.5, color: T.text2b, marginBottom: mobile ? 0 : 10 }}>
        {t('emballageD')}
      </div>
      {!mobile && (
        <>
          <button className="sc-btn sc-btn-green" style={{ width: '100%', justifyContent: 'center' }}
                  onClick={finish} disabled={busy}>
            <span className="ms">local_shipping</span>{busy ? t('validation') : t('valider')}
          </button>
          <a className="sc-btn sc-btn-secondary" style={{ width: '100%', justifyContent: 'center', marginTop: 6 }}
             href={`/admin/documents/bon-de-livraison/${active.id}`} target="_blank" rel="noopener">
            <span className="ms">print</span>{t('imprimerBL')}
          </a>
        </>
      )}
    </div>
  ) : partiel ? (
    /* Il manque un article : on envoie ce qui est pret
       plutot que de retenir tout le colis. */
    <div className="sc-card" style={{ borderColor: '#E8CFA8', padding: '13px 15px' }}>
      <div className="sc-card-title" style={{ color: '#8A5B08', marginBottom: 8 }}>{t('envoiPartiel')}</div>
      <div style={{ fontSize: mobile ? 13 : 11.5, color: T.text2b, marginBottom: 10 }}>
        {t('envoiPartielD')}
      </div>
      <div style={{ background: '#FDF6EA', borderRadius: 7, padding: '8px 11px', marginBottom: mobile ? 0 : 10 }}>
        {lines.filter(l => (picked[l.product_id] || 0) < l.qty).map(l => (
          <div key={l.product_id} style={{ display: 'flex', gap: 8, fontSize: mobile ? 13 : 11.5, color: '#8A5B08' }}>
            <span style={{ flex: 1, minWidth: 0 }}>{l.name}</span>
            <span className="sc-num" style={{ fontWeight: 700 }}>
              {l.qty - (picked[l.product_id] || 0)}
            </span>
          </div>
        ))}
      </div>
      {!mobile && (
        <button className="sc-btn" style={{
          width: '100%', justifyContent: 'center',
          background: '#8A5B08', color: '#fff', border: 'none',
        }} onClick={() => expedier(false)} disabled={busy}>
          <span className="ms">local_shipping</span>
          {busy ? t('validation') : t('expedierPret')}
        </button>
      )}
    </div>
  ) : (
    <div className="sc-card" style={{ padding: '13px 15px' }}>
      <div className="sc-card-title" style={{ marginBottom: 8 }}>{t('commentCa')}</div>
      {[t('etape1'), t('etape2'), t('etape3'), t('etape4')].map((s, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
          <span className="sc-num" style={{ fontSize: mobile ? 13 : 11, fontWeight: 700, color: 'var(--accent)' }}>{i + 1}</span>
          <span style={{ fontSize: mobile ? 13 : 11.5, color: T.text2b }}>{s}</span>
        </div>
      ))}
    </div>
  ));

  /* ═══════════════ TÉLÉPHONE ═══════════════ */
  if (mobile) {
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div className="sc-head">
          <div>
            <div className="sc-title">{t('titre')}</div>
            <div className="sc-sub">{t('sous')}</div>
          </div>
        </div>

        {loading && <SqueletteTable lignes={5} colonnes={3} vignette />}
        {!loading && orders.length === 0 && <div className="sc-empty">{t('vide')}</div>}

        {!loading && orders.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* File d'attente : une rangée de puces qu'on fait défiler */}
            <div>
              <div className="sc-label" style={{ marginBottom: 6 }}>{t('file')} ({orders.length})</div>
              <div className="sc-filters" role="tablist">
                {orders.map(o => {
                  let n = 0;
                  try { const l = typeof o.lines === 'string' ? JSON.parse(o.lines) : (o.lines || []); n = l.length; } catch {}
                  const on = o.id === activeId;
                  return (
                    <button key={o.id} role="tab" aria-selected={on} className={`sc-chip p-queue-chip${on ? ' on' : ''}`}
                            onClick={() => { selectOrder(o); }}>
                      <span className="sc-num">{o.order_number}</span>
                      <small>{(o.customer_name || '—').split(' ')[0]} · {n} {t('art')}</small>
                    </button>
                  );
                })}
              </div>
            </div>

            {active && (
              <>
                {/* Session */}
                <div className="sc-card" style={{ padding: '13px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 17, fontWeight: 700, color: T.ink }} className="sc-num">{active.order_number}</span>
                    <span className="sc-badge" style={{
                      background: enReliquat ? BADGE.amber.bg : BADGE.blue.bg,
                      color: enReliquat ? BADGE.amber.fg : BADGE.blue.fg,
                    }}>{enReliquat ? t('reliquat') : t('aPreparer')}</span>
                    <span style={{ flex: 1 }} />
                    <a className="sc-iconbtn" href={`/admin/documents/bon-de-livraison/${active.id}`} aria-label={t('feuille')} title={t('feuille')}>
                      <span className="ms">print</span>
                    </a>
                  </div>
                  {active.customer_name && <div style={{ fontSize: 14, color: T.text2, marginTop: 2 }}>{active.customer_name}</div>}
                  {progressBar}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                    <span className="sc-num" style={{ fontSize: 15, fontWeight: 600, color: complete ? T.green : T.ink }}>
                      {doneQty} / {totalQty}
                    </span>
                    <span style={{ fontSize: 13, color: T.text2b }}>{t('scannes')}</span>
                    <span style={{ flex: 1 }} />
                    <button className="sc-btn sc-btn-secondary p-btn-xs"
                            onClick={() => { setPicked({}); setFeedback(null); }}>{t('reinit')}</button>
                  </div>
                  <button className="sc-btn sc-btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}
                          onClick={() => setScanOpen(true)}>
                    <span className="ms">barcode_scanner</span>{t('scanner')}
                  </button>
                </div>

                {feedbackBox}
                {linesCard}
                {stateCard}

                {/* Validation sous le pouce */}
                <div className="sc-sticky-actions">
                  {partiel ? (
                    <button className="sc-btn" style={{ background: T.amberText, color: '#fff', border: 'none' }}
                            onClick={() => expedier(false)} disabled={busy}>
                      <span className="ms">local_shipping</span>{busy ? t('validation') : t('expedierPret')}
                    </button>
                  ) : (
                    <button className="sc-btn sc-btn-green" onClick={finish} disabled={busy || !complete}>
                      <span className="ms">local_shipping</span>
                      {busy ? t('validation') : complete ? t('valider') : `${t('valider')} · ${doneQty}/${totalQty}`}
                    </button>
                  )}
                </div>

                {/* Scanner plein écran (classes .sc-scan-sheet du shell) */}
                {scanOpen && (
                  <div className="sc-scan-sheet" role="dialog" aria-modal="true" aria-label={t('scanner')}>
                    <div className="sc-scan-sheet-head">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="sc-scan-sheet-title">{t('scanner')} · {active.order_number}</div>
                        <div className="sc-scan-sheet-sub">{doneQty} / {totalQty} {t('scannes')}</div>
                      </div>
                      <button onClick={() => setScanOpen(false)} aria-label={t('fermerScan')}>
                        <span className="ms" style={{ fontSize: 26 }}>close</span>
                      </button>
                    </div>
                    <div style={{ padding: '0 12px' }}>
                      <BarcodeScanner onScan={onScan} label={t('viser')} autoStart />
                    </div>
                    <div style={{ padding: '12px 12px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {progressBar}
                      {feedbackBox}
                      {complete && (
                        <>
                          <div style={{ color: '#fff', fontSize: 15, fontWeight: 600, textAlign: 'center' }}>{t('termine')}</div>
                          <button className="sc-btn sc-btn-green" style={{ width: '100%', justifyContent: 'center' }}
                                  onClick={() => { setScanOpen(false); finish(); }} disabled={busy}>
                            <span className="ms">local_shipping</span>{busy ? t('validation') : t('valider')}
                          </button>
                        </>
                      )}
                      <button className="sc-btn sc-btn-secondary" style={{ width: '100%', justifyContent: 'center' }}
                              onClick={() => setScanOpen(false)}>
                        <span className="ms">checklist</span>{t('voirArticles')}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {toast && <div className="sc-toast" role="status">{toast}</div>}
      </>
    );
  }

  /* ═══════════════ ORDINATEUR (inchangé) ═══════════════ */
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="sc-head">
        <div>
          <div className="sc-title">{t('titre')}</div>
          <div className="sc-sub">{t('sous')}</div>
        </div>
        <div className="sc-actions">
          {active && (
            <a className="sc-btn sc-btn-secondary" href={`/admin/documents/bon-de-livraison/${active.id}`} target="_blank" rel="noopener">
              <span className="ms">print</span>{t('feuille')}
            </a>
          )}
        </div>
      </div>

      {loading && <SqueletteTable lignes={5} colonnes={3} vignette />}
      {!loading && orders.length === 0 && (
        <div className="sc-empty">{t('vide')}</div>
      )}

      {!loading && orders.length > 0 && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>

          {/* File d'attente */}
          <div style={{ flex: '1 1 230px', minWidth: 0 }}>
            <div className="sc-card" style={{ background: T.sidebarBg, overflow: 'hidden' }}>
              <div style={{ padding: '12px 15px', borderBottom: `1px solid ${T.border}` }}>
                <span className="sc-card-title">{t('file')} ({orders.length})</span>
              </div>
              {orders.map(o => {
                const on = o.id === activeId;
                let n = 0;
                try { const l = typeof o.lines === 'string' ? JSON.parse(o.lines) : (o.lines || []); n = l.length; } catch {}
                return (
                  <button key={o.id} onClick={() => selectOrder(o)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer', border: 'none',
                      padding: '10px 14px', borderBottom: `1px solid ${T.borderFaint}`,
                      borderLeft: on ? '3px solid var(--accent)' : '3px solid transparent',
                      background: on ? '#fff' : 'transparent',
                    }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="sc-num" style={{ fontSize: 12.5, fontWeight: 600, color: T.ink }}>{o.order_number}</span>
                      <span style={{ flex: 1 }} />
                      <span style={{ fontSize: 10.5, color: T.muted }}>{n} {t('art')}</span>
                    </div>
                    <div style={{ fontSize: 11.5, color: T.text2 }}>{o.customer_name || '—'}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Session */}
          <div style={{ flex: '2 1 460px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {active && (
              <>
                <div className="sc-card" style={{ padding: '13px 15px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>{tc('order')} {active.order_number}</span>
                    <span className="sc-badge" style={{
                      background: enReliquat ? BADGE.amber.bg : BADGE.blue.bg,
                      color: enReliquat ? BADGE.amber.fg : BADGE.blue.fg,
                    }}>{enReliquat ? t('reliquat') : t('aPreparer')}</span>
                    <span style={{ flex: 1 }} />
                    <span className="sc-num" style={{ fontSize: 12.5, color: T.text2b }}>{doneQty} / {totalQty} {t('scannes')}</span>
                    <button className="sc-btn sc-btn-secondary p-btn-xs"
                            onClick={() => { setPicked({}); setFeedback(null); }}>{t('reinit')}</button>
                  </div>
                  {progressBar}
                </div>

                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <div style={{ flex: '1 1 280px', minWidth: 0 }}>
                    <BarcodeScanner onScan={onScan} label={t('viser')} />
                  </div>

                  <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                    {feedbackBox}
                    {stateCard}
                  </div>
                </div>

                {/* Articles à prélever */}
                {linesCard}
              </>
            )}
          </div>
        </div>
      )}

      {toast && <div className="sc-toast" role="status">{toast}</div>}
    </>
  );
}
