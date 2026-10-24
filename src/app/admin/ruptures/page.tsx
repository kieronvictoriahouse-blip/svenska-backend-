'use client';
import { useEffect, useMemo, useState } from 'react';
import { adminFetch } from '@/lib/auth-client';
import { T, BADGE, BadgeTone } from '@/lib/admin-theme';
import { useT, nomProduit } from '@/lib/admin-i18n';
import { TRU } from './i18n';

/* ═══════════════════════════════════════════════════════════════
   RUPTURES & REMPLACEMENTS

   Deux moitiés : à gauche on signale une rupture et on propose des
   remplacements, à droite on suit les réponses des clients.

   Le point qui compte : une réponse « rembourser » n'a rien déclenché
   côté argent — c'est volontaire, la route publique ne rembourse
   jamais toute seule. Cet écran est donc l'endroit où la demande
   remonte pour être validée à la main.
   ═══════════════════════════════════════════════════════════════ */

const STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  pending:          { label: 'En attente de réponse', tone: 'amber' },
  replaced:         { label: 'Remplacé',              tone: 'green' },
  refund_requested: { label: 'Remboursement à faire', tone: 'red' },
  waiting:          { label: 'Attend le réassort',    tone: 'blue' },
  done:             { label: 'Traité',                tone: 'gray' },
};

/* Téléphone : une seule colonne, le suivi des réponses (ce qu'on vient
   traiter) avant le formulaire ; réponses en cartes ; cases à cocher et
   boutons à 44 px. Ordinateur inchangé. */
const CSS = `
  .ru-grid { display: grid; grid-template-columns: minmax(0,340px) minmax(0,1fr); gap: 12px; align-items: start; }
  .ru-opts { max-height: 190px; }
  .ru-opt { padding: 6px 10px; font-size: 12px; }
  .ru-hint { font-size: 10.5px; }
  .ru-act { padding: 4px 9px; font-size: 11px; }
  .ru-act .ms { font-size: 15px; }
  @media (max-width: 899px) {
    .ru-grid { grid-template-columns: minmax(0, 1fr); }
    .ru-suivi { order: -1; }
    .ru-opts { max-height: 300px; }
    .ru-opt { min-height: 48px; padding: 8px 12px; font-size: 14px; gap: 12px !important; }
    .ru-opt input { width: 20px; height: 20px; }
    .ru-hint { font-size: 12px; line-height: 1.5; }
    .ru-act { padding: 10px 14px; font-size: 14px; }
    .ru-act .ms { font-size: 19px; }
    .ru-table tr { display: flex !important; flex-direction: column; }
    .ru-table td.sc-stack-main { order: -1; }
    .ru-table td.sc-stack-actions > div { justify-content: flex-start !important; flex-wrap: wrap; gap: 8px !important; }
    .ru-note { font-size: 12.5px !important; }
    .ru-table td.sc-stack-actions .sc-iconbtn { border: 1px solid ${T.borderField}; background: #fff; }
  }
`;

const eur = (n: any) =>
  (Number(n) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const dt = (d?: string) => (d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) : '—');

export default function RupturesPage() {
  const { t, tc, lang } = useT(TRU);
  const [rows, setRows] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [reserve, setReserve] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');

  // Formulaire d'envoi
  const [orderId, setOrderId] = useState('');
  const [lineIdx, setLineIdx] = useState('');
  const [options, setOptions] = useState<Set<string>>(new Set());
  const [titre, setTitre] = useState('Un article vient de partir en rupture');
  const [corps, setCorps] = useState('');
  const [busy, setBusy] = useState(false);

  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3500); };

  async function load() {
    setLoading(true);
    try {
      const [r, o, p, rv] = await Promise.all([
        adminFetch('/api/ruptures').then(x => x.json()),
        adminFetch('/api/orders?limit=200').then(x => x.json()).catch(() => ({})),
        adminFetch('/api/products?limit=1000').then(x => x.json()).catch(() => ({})),
        adminFetch('/api/stock/reserve').then(x => x.json()).catch(() => ({})),
      ]);
      setRows(r.ruptures || []);
      /* Toute commande dont la marchandise est due (STATUTS_DUS de
         lib/reserve) : une rupture se découvre surtout en préparant le
         colis, quand la commande est déjà « en préparation » — elle
         n'apparaissait pas dans la liste. */
      setOrders((o.orders || []).filter((x: any) => ['paid', 'confirmed', 'preparing', 'partial'].includes(x.status)));
      setProducts(p.products || []);
      setReserve(rv.reserve || {});
    } catch { say(t('msgChargement')); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const order = useMemo(() => orders.find(o => o.id === orderId), [orders, orderId]);
  const lines = useMemo(() => {
    try {
      const l = typeof order?.lines === 'string' ? JSON.parse(order.lines) : (order?.lines || []);
      return Array.isArray(l) ? l : [];
    } catch { return []; }
  }, [order]);
  const line = lines[Number(lineIdx)];
  const qteLigne = Number(line?.qty) || 0;

  /* Ce qu'on peut vraiment promettre : le rayon moins ce qui est déjà dû.
     Proposer sur le stock brut a fait promettre 3 Salvi à SD-0105 alors
     que 3 des 5 en rayon lui étaient déjà réservés — à elle. */
  const dispo = (p: any) => (Number(p?.stock) || 0) - (reserve[p?.id] || 0);

  async function envoyer() {
    if (!order || !line) { say(t('msgChoisir')); return; }
    if (!options.size) { say(t('msgProposer')); return; }
    // Email client : même confirmation que la relance.
    if (!window.confirm(`${t('confirmEnvoi')}\n\n${order.customer_email || ''}`)) return;
    setBusy(true);
    try {
      const res = await adminFetch(`/api/orders/${order.id}/rupture`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          line: { product_id: line.product_id, name: line.name || line.desc, qty: line.qty, price: line.price },
          options: Array.from(options),
          titre, corps,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Erreur');
      say(`Email envoyé à ${order.customer_email}`);
      setOrderId(''); setLineIdx(''); setOptions(new Set()); setCorps('');
      load();
    } catch (e: any) { say(e.message); }
    finally { setBusy(false); }
  }

  async function agir(id: string, action: 'appliquer' | 'clore') {
    try {
      const res = await adminFetch('/api/ruptures', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Échec');
      setRows(rs => rs.map(r => (r.id === id ? { ...r, status: 'done' } : r)));
      say(d.message || 'Demande close');
      if (d.remboursement_du > 0) load();
    } catch (e: any) { say(e.message); }
  }

  /* Relance : la demande reste en attente, seul le compteur bouge. Le
     jeton du lien est deterministe, donc le premier email recu par le
     client reste valide. */
  const [relance, setRelance] = useState<string | null>(null);
  async function relancer(r: any) {
    const dest = r.order?.customer_email || '';
    if (!window.confirm(`${t('confirmRelance')}

${dest}`)) return;
    setRelance(r.id);
    try {
      const res = await adminFetch('/api/ruptures', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: r.id, action: 'relancer' }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Échec');
      setRows(rs => rs.map(x => x.id === r.id
        ? { ...x, relances: d.relances, last_sent_at: new Date().toISOString(), last_send_error: null }
        : x));
      say(`${t('relanceEnvoyee')} ${d.destinataire}`);
    } catch (e: any) { say(e.message); }
    finally { setRelance(null); }
  }

  const enAttente = rows.filter(r => r.status === 'pending').length;
  const aTraiter = rows.filter(r => ['replaced', 'refund_requested', 'waiting'].includes(r.status)).length;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      {/* .sc-head/.sc-title/.sc-sub : mêmes valeurs que l'ancien style en ligne sur ordinateur */}
      <div className="sc-head">
        <div>
          <div className="sc-title">{t('titre')}</div>
          <div className="sc-sub">
            {enAttente} en attente de réponse · {aTraiter} réponse(s) à traiter
          </div>
        </div>
        <button className="sc-btn sc-btn-secondary" onClick={load}><span className="ms">refresh</span>{t('actualiser')}</button>
      </div>

      <div className="ru-grid">

        {/* ── Signaler une rupture ─────────────────────────── */}
        <div className="sc-card" style={{ overflow: 'hidden' }}>
          <div className="sc-card-title" style={{ padding: '12px 15px', borderBottom: `1px solid ${T.border}` }}>
            Signaler une rupture
          </div>
          <div style={{ padding: 15, display: 'flex', flexDirection: 'column', gap: 11 }}>
            <div>
              <label className="sc-label" htmlFor="ru-commande">{t('commande')}</label>
              <select id="ru-commande" className="sc-input" style={{ width: '100%' }} value={orderId}
                      onChange={e => { setOrderId(e.target.value); setLineIdx(''); }}>
                <option value="">— Choisir —</option>
                {orders.map(o => (
                  <option key={o.id} value={o.id}>{o.order_number} · {o.customer_name || o.customer_email}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="sc-label" htmlFor="ru-ligne">{t('enRupture')}</label>
              <select id="ru-ligne" className="sc-input" style={{ width: '100%' }} value={lineIdx}
                      onChange={e => setLineIdx(e.target.value)} disabled={!lines.length}>
                <option value="">{lines.length ? '— Choisir —' : 'Choisis d’abord une commande'}</option>
                {lines.map((l: any, i: number) => (
                  <option key={i} value={i}>{l.name || l.desc} — {l.qty} × {eur(l.price)}</option>
                ))}
              </select>
            </div>

            <div>
              <div className="sc-label">
                Remplacements proposés {options.size > 0 && `(${options.size})`}
              </div>
              <div className="ru-opts" style={{ border: `1px solid ${T.borderField}`, borderRadius: 7, overflowY: 'auto' }}>
                {products.filter(p => p.is_active && dispo(p) > 0).map(p => (
                  <label key={p.id} className="ru-opt" style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    borderBottom: `1px solid ${T.borderFaint}`, cursor: 'pointer',
                  }}>
                    <input type="checkbox" checked={options.has(p.id)} style={{ accentColor: 'var(--accent)' }}
                           onChange={() => setOptions(prev => {
                             const n = new Set(prev);
                             if (n.has(p.id)) n.delete(p.id); else n.add(p.id);
                             return n;
                           })} />
                    <span style={{ flex: 1, minWidth: 0, color: T.ink }}>{nomProduit(p, lang)}</span>
                    {/* Le disponible, pas le rayon : une partie de ce qui est
                        là est déjà due — parfois à ce client-là. */}
                    <span className="sc-num" style={{
                      color: dispo(p) < qteLigne ? '#B03A2E' : T.muted, fontSize: '0.92em',
                    }}>{dispo(p)}</span>
                    <span className="sc-num" style={{ color: T.muted }}>{eur(p.price)}</span>
                  </label>
                ))}
              </div>
              <div className="ru-hint" style={{ color: T.muted, marginTop: 4 }}>
                Le nombre affiché est le <strong>disponible</strong> — stock en rayon moins ce qui
                est déjà dû à d’autres commandes. En rouge : moins que les {qteLigne || '?'} unités
                à remplacer. Le client ne pourra pas en prendre plus.
              </div>
            </div>

            <div>
              <label className="sc-label" htmlFor="ru-titre">{t('titreMsg')}</label>
              <input id="ru-titre" className="sc-input" style={{ width: '100%' }} value={titre} onChange={e => setTitre(e.target.value)} />
            </div>

            <div>
              <label className="sc-label" htmlFor="ru-corps">{t('message')}</label>
              <textarea id="ru-corps" className="sc-input" rows={4}
                        style={{ width: '100%', height: 'auto', padding: '8px 10px', lineHeight: 1.5, resize: 'vertical' }}
                        placeholder={t('videParDefaut')}
                        value={corps} onChange={e => setCorps(e.target.value)} />
            </div>

            <button className="sc-btn sc-btn-primary" onClick={envoyer} disabled={busy} style={{ justifyContent: 'center' }}>
              <span className="ms">send</span>{busy ? 'Envoi…' : 'Envoyer au client'}
            </button>
          </div>
        </div>

        {/* ── Suivi des réponses ───────────────────────────── */}
        <div className="sc-card ru-suivi" style={{ overflow: 'hidden' }}>
          {loading ? (
            <div className="sc-empty">{tc('loading')}</div>
          ) : rows.length === 0 ? (
            <div className="sc-empty">
              <span className="ms" style={{ fontSize: 34, color: T.borderField, display: 'block', marginBottom: 8 }}>inventory_2</span>
              Aucune rupture signalée.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="sc-table sc-stack ru-table">
                <thead>
                  <tr>
                    <th style={{ width: 88 }}>{t('commande')}</th>
                    <th>{t('article')}</th>
                    <th>{t('reponse')}</th>
                    <th style={{ width: 150 }}>{tc('status')}</th>
                    <th style={{ width: 92, textAlign: 'right' }}>{t('montant')}</th>
                    <th style={{ width: 58 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => {
                    const st = STATUS[r.status] || STATUS.pending;
                    const du = Number(r.price_delta) || 0;
                    /* price_delta n'a pas le même signe selon la réponse
                       (route publique /api/remplacement) :
                       · remplacement : ancien − nouveau, > 0 = la boutique
                         doit la différence (l'email l'a promise) ;
                       · remboursement : −montant, < 0 = la boutique doit.
                       L'écran lisait tout comme un remboursement : un
                       remplaçant plus cher (différence offerte) s'affichait
                       « à rendre » en rouge, un moins cher (vraiment dû)
                       en gris. */
                    const remplacement = !!r.chosen_product_id
                      || (Array.isArray(r.chosen_mix) && r.chosen_mix.length > 0)
                      || r.status === 'replaced';
                    const aRendre = remplacement ? Math.max(0, du) : Math.max(0, -du);
                    const offert = remplacement && du < 0 ? -du : 0;
                    return (
                      <tr key={r.id}>
                        <td className="sc-num" data-label={t('commande')} style={{ fontSize: 12 }}>
                          <span>
                            {r.order?.order_number || '—'}
                            <div className="ru-note" style={{ fontSize: 10.5, color: T.muted }}>{dt(r.created_at)}</div>
                          </span>
                        </td>
                        <td className="sc-stack-main">
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '1em', color: T.ink }}>{r.line_name}</div>
                              <div className="ru-note" style={{ fontSize: 10.5, color: T.muted, fontWeight: 400 }}>{r.line_qty} × {eur(r.line_price)}</div>
                            </div>
                            {/* Statut en tête de carte sur téléphone */}
                            <span className="sc-badge sc-only-mobile" style={{ background: BADGE[st.tone].bg, color: BADGE[st.tone].fg }}>
                              {st.label}
                            </span>
                          </div>
                        </td>
                        <td data-label={t('reponse')} style={{ fontSize: 12, color: T.text2b }}>
                          <span>
                            {r.chosen_label || <span style={{ color: T.muted }}>—</span>}
                            {r.decided_at && <div className="ru-note" style={{ fontSize: 10.5, color: T.muted }}>{dt(r.decided_at)}</div>}
                          </span>
                        </td>
                        <td className="sc-hide-mobile">
                          <span className="sc-badge" style={{ background: BADGE[st.tone].bg, color: BADGE[st.tone].fg }}>
                            {st.label}
                          </span>
                        </td>
                        <td className="sc-num" data-label={t('montant')} style={{ textAlign: 'right', fontSize: 12.5, fontWeight: aRendre > 0 && r.status !== 'done' ? 700 : 400, color: aRendre > 0 && r.status !== 'done' ? T.red : T.text2b }}>
                          {aRendre > 0 ? `${eur(aRendre)} ${t('aRendre')}` : offert > 0 ? `${eur(offert)} ${t('offert')}` : '—'}
                        </td>
                        <td className="sc-stack-actions">
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                            {/* Le remplacement s'applique ici ; un remboursement
                                se fait depuis la fiche commande, avec son ecran. */}
                            {r.status === 'replaced' && (
                              <button className="sc-btn sc-btn-green ru-act"
                                      onClick={() => agir(r.id, 'appliquer')}>
                                Appliquer
                              </button>
                            )}
                            {r.status === 'refund_requested' && r.order && (
                              <a className="sc-btn sc-btn-secondary ru-act"
                                 href={`/admin/commandes?q=${encodeURIComponent(r.order.order_number)}`}>
                                Rembourser
                              </a>
                            )}
                            {r.status === 'pending' && (
                              <button className="sc-btn sc-btn-secondary ru-act"
                                      onClick={() => relancer(r)} disabled={relance === r.id}>
                                <span className="ms">outgoing_mail</span>
                                {relance === r.id ? t('relanceEnCours') : t('relancer')}
                              </button>
                            )}
                            {r.status !== 'pending' && r.status !== 'done' && (
                              <button className="sc-iconbtn" title={t('marquerTraite')} aria-label={t('marquerTraite')} onClick={() => agir(r.id, 'clore')}>
                                <span className="ms" style={{ color: T.green }}>check_circle</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="ru-note" style={{ padding: '11px 15px', background: T.surfaceAlt, fontSize: 11.5, color: T.muted, borderTop: `1px solid ${T.border}` }}>
            Un remboursement demandé par le client n&rsquo;est jamais exécuté automatiquement :
            il se déclenche depuis la fiche commande, après ton contrôle.
          </div>
        </div>
      </div>

      {toast && <div className="sc-toast" role="status">{toast}</div>}
    </>
  );
}
