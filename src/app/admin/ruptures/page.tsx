'use client';
import { useEffect, useMemo, useState } from 'react';
import { adminFetch } from '@/lib/auth-client';
import { T, BADGE, BadgeTone } from '@/lib/admin-theme';

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

const eur = (n: any) =>
  (Number(n) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const dt = (d?: string) => (d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) : '—');

export default function RupturesPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
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
      const [r, o, p] = await Promise.all([
        adminFetch('/api/ruptures').then(x => x.json()),
        adminFetch('/api/orders?limit=200').then(x => x.json()).catch(() => ({})),
        adminFetch('/api/products?limit=1000').then(x => x.json()).catch(() => ({})),
      ]);
      setRows(r.ruptures || []);
      setOrders((o.orders || []).filter((x: any) => ['paid', 'confirmed'].includes(x.status)));
      setProducts(p.products || []);
    } catch { say('Chargement impossible'); }
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

  async function envoyer() {
    if (!order || !line) { say('Choisis une commande et un article'); return; }
    if (!options.size) { say('Propose au moins un remplacement'); return; }
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

  const enAttente = rows.filter(r => r.status === 'pending').length;
  const aTraiter = rows.filter(r => ['replaced', 'refund_requested', 'waiting'].includes(r.status)).length;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-.2px', color: T.ink }}>Ruptures &amp; remplacements</div>
          <div style={{ fontSize: 11.5, color: T.text3, marginTop: 2 }}>
            {enAttente} en attente de réponse · {aTraiter} réponse(s) à traiter
          </div>
        </div>
        <button className="sc-btn sc-btn-secondary" onClick={load}><span className="ms">refresh</span>Actualiser</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,340px) minmax(0,1fr)', gap: 12, alignItems: 'start' }}>

        {/* ── Signaler une rupture ─────────────────────────── */}
        <div className="sc-card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '12px 15px', borderBottom: `1px solid ${T.border}`, fontSize: 12.5, fontWeight: 600, color: T.ink }}>
            Signaler une rupture
          </div>
          <div style={{ padding: 15, display: 'flex', flexDirection: 'column', gap: 11 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: T.text2b, marginBottom: 5 }}>Commande</label>
              <select className="sc-input" style={{ width: '100%' }} value={orderId}
                      onChange={e => { setOrderId(e.target.value); setLineIdx(''); }}>
                <option value="">— Choisir —</option>
                {orders.map(o => (
                  <option key={o.id} value={o.id}>{o.order_number} · {o.customer_name || o.customer_email}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: T.text2b, marginBottom: 5 }}>Article en rupture</label>
              <select className="sc-input" style={{ width: '100%' }} value={lineIdx}
                      onChange={e => setLineIdx(e.target.value)} disabled={!lines.length}>
                <option value="">{lines.length ? '— Choisir —' : 'Choisis d’abord une commande'}</option>
                {lines.map((l: any, i: number) => (
                  <option key={i} value={i}>{l.name || l.desc} — {l.qty} × {eur(l.price)}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: T.text2b, marginBottom: 5 }}>
                Remplacements proposés {options.size > 0 && `(${options.size})`}
              </label>
              <div style={{ border: `1px solid ${T.borderField}`, borderRadius: 7, maxHeight: 190, overflowY: 'auto' }}>
                {products.filter(p => p.is_active && (p.stock ?? 0) > 0).map(p => (
                  <label key={p.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                    borderBottom: `1px solid ${T.borderFaint}`, fontSize: 12, cursor: 'pointer',
                  }}>
                    <input type="checkbox" checked={options.has(p.id)} style={{ accentColor: 'var(--accent)' }}
                           onChange={() => setOptions(prev => {
                             const n = new Set(prev);
                             if (n.has(p.id)) n.delete(p.id); else n.add(p.id);
                             return n;
                           })} />
                    <span style={{ flex: 1, minWidth: 0, color: T.ink }}>{p.name_fr}</span>
                    <span className="sc-num" style={{ color: T.muted }}>{eur(p.price)}</span>
                  </label>
                ))}
              </div>
              <div style={{ fontSize: 10.5, color: T.muted, marginTop: 4 }}>
                Seuls les articles actifs et en stock sont proposables.
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: T.text2b, marginBottom: 5 }}>Titre</label>
              <input className="sc-input" style={{ width: '100%' }} value={titre} onChange={e => setTitre(e.target.value)} />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: T.text2b, marginBottom: 5 }}>Message</label>
              <textarea className="sc-input" rows={4}
                        style={{ width: '100%', height: 'auto', padding: '8px 10px', lineHeight: 1.5, resize: 'vertical' }}
                        placeholder="Laisse vide pour le texte par défaut."
                        value={corps} onChange={e => setCorps(e.target.value)} />
            </div>

            <button className="sc-btn sc-btn-primary" onClick={envoyer} disabled={busy} style={{ justifyContent: 'center' }}>
              <span className="ms">send</span>{busy ? 'Envoi…' : 'Envoyer au client'}
            </button>
          </div>
        </div>

        {/* ── Suivi des réponses ───────────────────────────── */}
        <div className="sc-card" style={{ overflow: 'hidden' }}>
          {loading ? (
            <div className="sc-empty">Chargement…</div>
          ) : rows.length === 0 ? (
            <div className="sc-empty">
              <span className="ms" style={{ fontSize: 34, color: T.borderField, display: 'block', marginBottom: 8 }}>inventory_2</span>
              Aucune rupture signalée.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="sc-table">
                <thead>
                  <tr>
                    <th style={{ width: 88 }}>Commande</th>
                    <th>Article</th>
                    <th>Réponse</th>
                    <th style={{ width: 150 }}>Statut</th>
                    <th style={{ width: 92, textAlign: 'right' }}>Montant</th>
                    <th style={{ width: 58 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => {
                    const st = STATUS[r.status] || STATUS.pending;
                    const du = Number(r.price_delta) || 0;
                    return (
                      <tr key={r.id}>
                        <td className="sc-num" style={{ fontSize: 12 }}>
                          {r.order?.order_number || '—'}
                          <div style={{ fontSize: 10.5, color: T.muted }}>{dt(r.created_at)}</div>
                        </td>
                        <td>
                          <div style={{ fontSize: 12.5, color: T.ink }}>{r.line_name}</div>
                          <div style={{ fontSize: 10.5, color: T.muted }}>{r.line_qty} × {eur(r.line_price)}</div>
                        </td>
                        <td style={{ fontSize: 12, color: T.text2b }}>
                          {r.chosen_label || <span style={{ color: T.muted }}>—</span>}
                          {r.decided_at && <div style={{ fontSize: 10.5, color: T.muted }}>{dt(r.decided_at)}</div>}
                        </td>
                        <td>
                          <span className="sc-badge" style={{ background: BADGE[st.tone].bg, color: BADGE[st.tone].fg }}>
                            {st.label}
                          </span>
                        </td>
                        <td className="sc-num" style={{ textAlign: 'right', fontSize: 12.5, fontWeight: du < 0 ? 700 : 400, color: du < 0 ? T.red : T.text2b }}>
                          {du < 0 ? `${eur(Math.abs(du))} à rendre` : du > 0 ? eur(du) : '—'}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                            {/* Le remplacement s'applique ici ; un remboursement
                                se fait depuis la fiche commande, avec son ecran. */}
                            {r.status === 'replaced' && (
                              <button className="sc-btn sc-btn-green" style={{ padding: '4px 9px', fontSize: 11 }}
                                      onClick={() => agir(r.id, 'appliquer')}>
                                Appliquer
                              </button>
                            )}
                            {r.status === 'refund_requested' && r.order && (
                              <a className="sc-btn sc-btn-secondary" style={{ padding: '4px 9px', fontSize: 11 }}
                                 href={`/admin/commandes?q=${encodeURIComponent(r.order.order_number)}`}>
                                Rembourser
                              </a>
                            )}
                            {r.status !== 'pending' && r.status !== 'done' && (
                              <button className="sc-iconbtn" title="Marquer comme traité" onClick={() => agir(r.id, 'clore')}>
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

          <div style={{ padding: '11px 15px', background: T.surfaceAlt, fontSize: 11.5, color: T.muted, borderTop: `1px solid ${T.border}` }}>
            Un remboursement demandé par le client n&rsquo;est jamais exécuté automatiquement :
            il se déclenche depuis la fiche commande, après ton contrôle.
          </div>
        </div>
      </div>

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, background: T.ink, color: '#fff',
          padding: '10px 18px', borderRadius: 7, fontSize: 12.5, zIndex: 300,
        }}>{toast}</div>
      )}
    </>
  );
}
