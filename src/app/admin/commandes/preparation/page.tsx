'use client';
import { useEffect, useMemo, useState } from 'react';
import { adminFetch } from '@/lib/auth-client';
import { T, BADGE, thumbStyle, initials, eur } from '@/lib/admin-theme';
import BarcodeScanner from '@/components/BarcodeScanner';
import { useT } from '@/lib/admin-i18n';
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
};

/* Une commande partiellement expediee revient dans la file : c'est la
   qu'on prepare son reliquat quand le reassort arrive. */
const PAID = ['paid', 'confirmed', 'preparing', 'partial'];

export default function PreparationPage() {
  const { t, tc, lang } = useT(TP);
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [feedback, setFeedback] = useState<{ ok: boolean; title: string; detail: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');

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
        if (queue.length) selectOrder(queue[0]);
      } finally { setLoading(false); }
    })();
  }, []);

  function selectOrder(o: Order) {
    setActiveId(o.id);
    setPicked(o.picking && typeof o.picking === 'object' ? { ...o.picking } : {});
    setFeedback(null);
  }

  const active = orders.find(o => o.id === activeId) || null;

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

    const colis = Object.fromEntries(
      lines.map(l => [l.product_id, Math.min(l.qty, picked[l.product_id] || 0)])
           .filter(([, n]) => (n as number) > 0));

    if (!tout) {
      const manque = lines
        .filter(l => (picked[l.product_id] || 0) < l.qty)
        .map(l => `${l.name} — ${l.qty - (picked[l.product_id] || 0)}`);
      if (!window.confirm(`${t('confirmReliquat')}\n\n${manque.join('\n')}`)) return;
    }

    setBusy(true);
    try {
      /* AUCUN mouvement de stock ici — c'est deliberé.
         Le stock est deja deduit AU PAIEMENT par le webhook Stripe
         (`applySaleStock`, idempotent), sur la totalite de la commande.
         Le decrementer une seconde fois au picking retirait les memes
         unites deux fois : 40 unites fantomes sur 16 produits avant
         correction, dont 8 produits affiches a zero alors qu'il en
         restait. Le stock peut passer negatif, et ce negatif est
         precisement la trace de ce qu'on doit encore. */

      // Le cumul sert au reste du ; le dernier colis alimente le bon de
      // livraison, qui decrit un colis et non un historique.
      const cumul = { ...(active.shipped_qty || {}) };
      for (const [productId, n] of Object.entries(colis)) {
        cumul[productId] = (Number(cumul[productId]) || 0) + (n as number);
      }

      const res = await adminFetch(`/api/orders/${active.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: tout ? 'shipped' : 'partial',
          picking: tout ? picked : {},
          shipped_qty: cumul,
          last_shipment: colis,
          picked_at: new Date().toISOString(),
          ...(tout ? {} : { backorder_at: new Date().toISOString() }),
        }),
      });
      if (!res.ok) throw new Error();

      if (tout) {
        say(`${active.order_number} ${t('expediee')}`);
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

  return (
    <>
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
                    <button className="sc-btn sc-btn-secondary" style={{ padding: '5px 10px', fontSize: 11 }}
                            onClick={() => { setPicked({}); setFeedback(null); }}>{t('reinit')}</button>
                  </div>
                  <div style={{ height: 7, borderRadius: 4, background: T.borderFaint2, marginTop: 10, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', width: `${pct}%`, borderRadius: 4,
                      background: complete ? T.green : 'var(--accent)', transition: 'width .2s',
                    }} />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <div style={{ flex: '1 1 280px', minWidth: 0 }}>
                    <BarcodeScanner onScan={onScan} label={t('viser')} />
                  </div>

                  <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                    {feedback && (
                      <div style={{
                        display: 'flex', alignItems: 'flex-start', gap: 9, padding: '12px 14px', borderRadius: 9,
                        background: feedback.ok ? '#F1F6EF' : '#FDF0EE',
                        border: `1px solid ${feedback.ok ? '#CFE0C8' : '#EFC3BC'}`,
                        marginBottom: 10,
                      }}>
                        <span className="ms" style={{ fontSize: 19, color: feedback.ok ? '#3E5238' : '#B03A2E' }}>
                          {feedback.ok ? 'check_circle' : 'error'}
                        </span>
                        <div>
                          <div style={{ fontSize: 13.5, fontWeight: 700, color: feedback.ok ? '#3E5238' : '#B03A2E' }}>{feedback.title}</div>
                          <div style={{ fontSize: 11.5, color: T.text2b }}>{feedback.detail}</div>
                        </div>
                      </div>
                    )}

                    {complete ? (
                      <div className="sc-card" style={{ borderColor: '#CFE0C8', padding: '13px 15px' }}>
                        <div className="sc-card-title" style={{ color: '#3E5238', marginBottom: 8 }}>{t('emballage')}</div>
                        <div style={{ fontSize: 11.5, color: T.text2b, marginBottom: 10 }}>
                          {t('emballageD')}
                        </div>
                        <button className="sc-btn sc-btn-green" style={{ width: '100%', justifyContent: 'center' }}
                                onClick={finish} disabled={busy}>
                          <span className="ms">local_shipping</span>{busy ? t('validation') : t('valider')}
                        </button>
                        <a className="sc-btn sc-btn-secondary" style={{ width: '100%', justifyContent: 'center', marginTop: 6 }}
                           href={`/admin/documents/bon-de-livraison/${active.id}`} target="_blank" rel="noopener">
                          <span className="ms">print</span>{t('imprimerBL')}
                        </a>
                      </div>
                    ) : partiel ? (
                      /* Il manque un article : on envoie ce qui est pret
                         plutot que de retenir tout le colis. */
                      <div className="sc-card" style={{ borderColor: '#E8CFA8', padding: '13px 15px' }}>
                        <div className="sc-card-title" style={{ color: '#8A5B08', marginBottom: 8 }}>{t('envoiPartiel')}</div>
                        <div style={{ fontSize: 11.5, color: T.text2b, marginBottom: 10 }}>
                          {t('envoiPartielD')}
                        </div>
                        <div style={{ background: '#FDF6EA', borderRadius: 7, padding: '8px 11px', marginBottom: 10 }}>
                          {lines.filter(l => (picked[l.product_id] || 0) < l.qty).map(l => (
                            <div key={l.product_id} style={{ display: 'flex', gap: 8, fontSize: 11.5, color: '#8A5B08' }}>
                              <span style={{ flex: 1, minWidth: 0 }}>{l.name}</span>
                              <span className="sc-num" style={{ fontWeight: 700 }}>
                                {l.qty - (picked[l.product_id] || 0)}
                              </span>
                            </div>
                          ))}
                        </div>
                        <button className="sc-btn" style={{
                          width: '100%', justifyContent: 'center',
                          background: '#8A5B08', color: '#fff', border: 'none',
                        }} onClick={() => expedier(false)} disabled={busy}>
                          <span className="ms">local_shipping</span>
                          {busy ? t('validation') : t('expedierPret')}
                        </button>
                      </div>
                    ) : (
                      <div className="sc-card" style={{ padding: '13px 15px' }}>
                        <div className="sc-card-title" style={{ marginBottom: 8 }}>{t('commentCa')}</div>
                        {[t('etape1'), t('etape2'), t('etape3'), t('etape4')].map((s, i) => (
                          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                            <span className="sc-num" style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)' }}>{i + 1}</span>
                            <span style={{ fontSize: 11.5, color: T.text2b }}>{s}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Articles à prélever */}
                <div className="sc-card" style={{ overflow: 'hidden' }}>
                  <div style={{ padding: '12px 15px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center' }}>
                    <span className="sc-card-title">{t('aPrelever')}</span>
                    <span style={{ flex: 1 }} />
                    <button className="sc-btn sc-btn-secondary" style={{ padding: '5px 10px', fontSize: 11 }} onClick={saveProgress}>
                      {t('enregAvanc')}
                    </button>
                  </div>
                  {lines.length === 0 && <div className="sc-empty">{t('aucuneLigne')}</div>}
                  {lines.map(l => {
                    const got = picked[l.product_id] || 0;
                    const done = got >= l.qty;
                    return (
                      <div key={l.product_id} style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 15px',
                        borderBottom: `1px solid ${T.borderFaint}`,
                        borderLeft: `3px solid ${done ? T.green : 'transparent'}`,
                        background: done ? '#FAFCF9' : undefined,
                      }}>
                        <div style={{
                          width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: done ? T.green : T.borderFaint2,
                        }}>
                          <span className="ms" style={{ fontSize: 17, color: done ? '#fff' : T.muted3 }}>check</span>
                        </div>
                        {l.image_url
                          ? <img src={l.image_url} alt="" style={thumbStyle(l.name, 34)} />
                          : <div style={thumbStyle(l.name, 34)}>{initials(l.name, 1)}</div>}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, color: T.ink }}>{l.name}</div>
                          <div className="sc-num" style={{ fontSize: 10.5, color: T.muted }}>
                            {[l.ref, l.ean ? `EAN ${l.ean}` : t('sansEan')].filter(Boolean).join(' · ')}
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <button className="sc-iconbtn" style={{ width: 28, height: 28 }} onClick={() => adjust(l, -1)} aria-label={t('moins')}>
                            <span className="ms">remove</span>
                          </button>
                          <span className="sc-num" style={{ fontSize: 12.5, fontWeight: 700, minWidth: 40, textAlign: 'center', color: done ? T.green : T.ink }}>
                            {got} / {l.qty}
                          </span>
                          <button className="sc-iconbtn" style={{ width: 28, height: 28 }} onClick={() => adjust(l, +1)} aria-label={t('plus')}>
                            <span className="ms">add</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {lines.some(l => !l.ean) && (
                    <div style={{ padding: '10px 15px', background: '#FDF6EA', fontSize: 11.5, color: '#8A5B08' }}>
                      {t('avertEan')}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: T.ink, color: '#fff', padding: '10px 18px', borderRadius: 7, fontSize: 12.5, zIndex: 300 }}>
          {toast}
        </div>
      )}
    </>
  );
}
