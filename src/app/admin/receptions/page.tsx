'use client';
import { useEffect, useState } from 'react';
import { adminFetch } from '@/lib/auth-client';
import { T, BADGE, eur, thumbStyle, initials } from '@/lib/admin-theme';
import { repartir } from '@/lib/landed';
import { SqueletteTable } from '@/components/Squelette';
import { useIsMobile } from '@/lib/use-mobile';
import { useT } from '@/lib/admin-i18n';
import { TRE } from './i18n';

/* Téléphone : liste des réceptions d'abord, une réception ouverte
   ensuite (bouton retour) — les deux colonnes empilées faisaient
   défiler tout le détail avant d'atteindre l'historique. Lignes sur
   deux niveaux, cases à cocher à 44 px. Ordinateur inchangé. */
const CSS = `
  .re-porteur { padding: 6px 11px; }
  .re-porteur input { width: 14px; height: 14px; }
  .re-tout { font-size: 11px; }
  @media (max-width: 899px) {
    .re-porteur { padding: 10px 12px; min-height: 48px; }
    .re-porteur input { width: 20px; height: 20px; }
    .re-porteur > span { font-size: 14px !important; }
    .re-porteur > span:first-of-type { flex: 1 1 calc(100% - 40px) !important; }
    .re-porteur > span + span { margin-left: 29px; font-size: 13px !important; }
    .re-tout { font-size: 13.5px; min-height: 44px; padding: 0 4px; }
    .re-hist-row { padding: 14px 15px !important; }
    .re-hist-row .re-l2 { font-size: 13px !important; }
    .re-l3 { font-size: 12.5px !important; }
    .re-small { font-size: 12px !important; }
  }
`;

/* ═══════════════════════════════════════════════════════════════
   ÉCRAN 8 — RÉCEPTIONS
   Handoff §8 : deux colonnes — la réception en cours à gauche
   (bandeau ambre, ligne par article avec Attendu / Reçu et badge
   Conforme / Manquant), l'historique à droite.
   Les coûts logistiques (landed costs) sont propres à ce back-office
   et sont conservés : ils mettent à jour le PMP.
   ═══════════════════════════════════════════════════════════════ */

type Reception = {
  id: string; number: string; status: string; supplier_name?: string;
  received_at: string; notes?: string; lines: any[];
  purchase_order_id?: string;
  purchase_orders?: { number: string };
  contacts?: { company?: string; first_name?: string; last_name?: string };
};
type LandedCost = {
  id: string; description: string; amount: number;
  allocation_method: string; status: string; lines: any[]; created_at: string;
};

const fmtDate = (d?: string) => d
  ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—';

const supplierOf = (r: Reception) =>
  r.supplier_name || r.contacts?.company ||
  [r.contacts?.first_name, r.contacts?.last_name].filter(Boolean).join(' ') || 'Fournisseur';

export default function ReceptionsPage() {
  const { t, tc } = useT(TRE);
  const [receptions, setReceptions] = useState<Reception[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Reception | null>(null);
  const [toast, setToast] = useState('');
  const [landedCosts, setLandedCosts] = useState<LandedCost[]>([]);
  const [lcForm, setLcForm] = useState({ description: '', amount: '', allocation_method: 'equal' });
  const [lcSaving, setLcSaving] = useState(false);
  const [lcResult, setLcResult] = useState<any[] | null>(null);
  /* Lignes décochées : par défaut le port se répartit sur tout. */
  const [lcExclus, setLcExclus] = useState<Record<string, boolean>>({});
  /* Téléphone : liste ou détail. Sur ordinateur, les deux sont visibles. */
  const mobile = useIsMobile();
  const [vueDetail, setVueDetail] = useState(false);
  const ouvrir = (r: Reception) => {
    selectReception(r);
    if (mobile) {
      setVueDetail(true);
      document.querySelector('.sc-main')?.scrollTo({ top: 0 });
    }
  };

  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3500); };

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const d = await adminFetch('/api/receptions').then(r => r.json());
      const list = d.receptions || [];
      setReceptions(list);
      if (list.length && !selected) selectReception(list[0]);
    } finally { setLoading(false); }
  }

  async function selectReception(r: Reception) {
    setSelected(r);
    setLcResult(null);
    setLcExclus({});
    setLcForm({ description: '', amount: '', allocation_method: 'equal' });
    try {
      const d = await adminFetch(`/api/landed-costs?reception_id=${r.id}`).then(x => x.json());
      setLandedCosts(d.landed_costs || []);
    } catch { setLandedCosts([]); }
  }

  async function saveLandedCost() {
    if (!selected || !lcForm.description || !lcForm.amount) { say(t('msgRequis')); return; }
    const porteurs = linesOf(selected)
      .filter((l: any) => l.product_id && Number(l.received_qty) > 0 && !lcExclus[l.product_id]);
    /* Sans garde, une sélection vide serait comprise côté serveur comme
       « pas de sélection », donc imputée sur tout — l'inverse du geste. */
    if (!porteurs.length) { say(t('msgCoche')); return; }
    setLcSaving(true);
    try {
      const res = await adminFetch('/api/landed-costs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reception_id: selected.id,
          description: lcForm.description,
          amount: parseFloat(lcForm.amount),
          allocation_method: lcForm.allocation_method,
          product_ids: porteurs.map((l: any) => l.product_id),
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Erreur');
      say(t('msgImpute'));
      setLcResult(d.lines);
      setLcForm({ description: '', amount: '', allocation_method: 'equal' });
      const d2 = await adminFetch(`/api/landed-costs?reception_id=${selected.id}`).then(x => x.json());
      setLandedCosts(d2.landed_costs || []);
    } catch (e: any) { say(e.message); }
    finally { setLcSaving(false); }
  }

  const linesOf = (r: Reception) => {
    try { return typeof r.lines === 'string' ? JSON.parse(r.lines) : (r.lines || []); }
    catch { return []; }
  };

  const montrerDetail = !mobile || vueDetail;
  const montrerListe = !mobile || !vueDetail;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      {mobile && vueDetail ? (
        /* Téléphone, réception ouverte : retour à la liste en tête */
        <div className="sc-head" style={{ alignItems: 'center', flexWrap: 'nowrap' }}>
          <button className="sc-iconbtn" onClick={() => setVueDetail(false)} aria-label={t('titre')}
                  style={{ border: `1px solid ${T.borderField}`, background: '#fff', flexShrink: 0 }}>
            <span className="ms">arrow_back</span>
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="sc-sub" style={{ marginTop: 0 }}>{t('titre')}</div>
            <div className="sc-title">{selected?.number}</div>
          </div>
        </div>
      ) : (
      <div className="sc-head">
        <div>
          <div className="sc-title">{t('titre')}</div>
          <div className="sc-sub">
            {receptions.length} réception{receptions.length > 1 ? 's' : ''} · une ligne incomplète crée un reliquat sur la commande d’achat
          </div>
        </div>
        <div className="sc-actions">
          <a className="sc-btn sc-btn-secondary" href="/admin/achats"><span className="ms">shopping_basket</span>{t('cmdAchat')}</a>
        </div>
      </div>
      )}

      {loading && <SqueletteTable lignes={5} colonnes={4} />}
      {!loading && receptions.length === 0 && (
        <div className="sc-empty">{t('aucune')}</div>
      )}

      {!loading && receptions.length > 0 && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>

          {/* ── Réception en cours ─────────────────────── */}
          {montrerDetail && (
          <div style={{ flex: '2 1 420px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {selected && (
              <>
                <div className="sc-card" style={{ overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '13px 15px', background: '#FDF9F1', borderBottom: `1px solid ${T.border}` }}>
                    <span className="ms" style={{ fontSize: 20, color: BADGE.amber.fg }}>local_shipping</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>
                        {selected.number} · {supplierOf(selected)}
                      </div>
                      <div className="re-l3" style={{ fontSize: 11, color: T.muted }}>
                        {selected.purchase_orders?.number ? `${selected.purchase_orders.number} · ` : ''}
                        reçue le {fmtDate(selected.received_at)} · {linesOf(selected).length} ligne(s)
                      </div>
                    </div>
                    <span className="sc-badge" style={{ background: BADGE.green.bg, color: BADGE.green.fg }}>
                      {selected.status || 'reçue'}
                    </span>
                  </div>

                  <div>
                    {linesOf(selected).map((l: any, i: number) => {
                      const expected = Number(l.qty_expected ?? l.qty_ordered ?? l.qty) || 0;
                      const got = Number(l.qty_received ?? l.qty) || 0;
                      const ok = got >= expected;
                      if (mobile) return (
                        /* Téléphone : le nom sur toute la largeur, les quantités dessous */
                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 11, padding: '12px 15px', borderBottom: `1px solid ${T.borderFaint}` }}>
                          <div style={thumbStyle(l.name || l.product_name || 'x', 36)}>
                            {initials(l.name || l.product_name || '?', 1)}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                              <div style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 500, color: T.ink, lineHeight: 1.35 }}>
                                {l.name || l.product_name || 'Article'}
                              </div>
                              <span className="sc-badge" style={{
                                background: ok ? BADGE.green.bg : BADGE.amber.bg,
                                color: ok ? BADGE.green.fg : BADGE.amber.fg,
                              }}>{ok ? 'Conforme' : 'Manquant'}</span>
                            </div>
                            <div className="sc-num" style={{ fontSize: 13, color: T.text2b, marginTop: 4 }}>
                              {l.ref && <span style={{ color: T.muted }}>{l.ref} · </span>}
                              {t('attendu')} {expected} · Reçu{' '}
                              <b style={{ color: ok ? T.green : BADGE.amber.fg }}>{got}</b>
                            </div>
                          </div>
                        </div>
                      );
                      return (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 15px', borderBottom: `1px solid ${T.borderFaint}` }}>
                          <div style={thumbStyle(l.name || l.product_name || 'x', 28)}>
                            {initials(l.name || l.product_name || '?', 1)}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12.5, color: T.ink }}>{l.name || l.product_name || 'Article'}</div>
                            {l.ref && <div className="sc-num" style={{ fontSize: 10.5, color: T.muted }}>{l.ref}</div>}
                          </div>
                          <div style={{ textAlign: 'center', minWidth: 62 }}>
                            <div className="sc-num" style={{ fontSize: 12.5, color: T.text2b }}>{expected}</div>
                            <div style={{ fontSize: 9, color: T.muted, textTransform: 'uppercase', letterSpacing: .8 }}>{t('attendu')}</div>
                          </div>
                          <div style={{ textAlign: 'center', minWidth: 62 }}>
                            <div className="sc-num" style={{
                              fontSize: 12.5, fontWeight: 700,
                              color: ok ? T.green : BADGE.amber.fg,
                            }}>{got}</div>
                            <div style={{ fontSize: 9, color: T.muted, textTransform: 'uppercase', letterSpacing: .8 }}>Reçu</div>
                          </div>
                          <span className="sc-badge" style={{
                            background: ok ? BADGE.green.bg : BADGE.amber.bg,
                            color: ok ? BADGE.green.fg : BADGE.amber.fg,
                          }}>{ok ? 'Conforme' : 'Manquant'}</span>
                        </div>
                      );
                    })}
                  </div>

                  {selected.notes && (
                    <div style={{ padding: '11px 15px', background: T.surfaceAlt, fontSize: 12, fontStyle: 'italic', color: T.text2b }}>
                      {selected.notes}
                    </div>
                  )}
                </div>

                {/* Coûts logistiques → PMP */}
                <div className="sc-card">
                  <div style={{ padding: '12px 15px', borderBottom: `1px solid ${T.border}` }}>
                    <span className="sc-card-title">{t('couts')}</span>
                    <div className="re-small" style={{ fontSize: 10.5, color: T.muted, marginTop: 2 }}>
                      {t('coutsSous')}
                    </div>
                  </div>
                  <div style={{ padding: '13px 15px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 10 }}>
                      <div>
                        <label className="sc-label">{t('description')}</label>
                        <input className="sc-input" value={lcForm.description} placeholder={t('exTransport')}
                               onChange={e => setLcForm(f => ({ ...f, description: e.target.value }))} />
                      </div>
                      <div>
                        <label className="sc-label">{t('montant')}</label>
                        <input className="sc-input sc-num" type="number" inputMode="decimal" step="0.01" min="0" value={lcForm.amount} placeholder="56.90"
                               onChange={e => setLcForm(f => ({ ...f, amount: e.target.value }))} />
                      </div>
                      <div>
                        <label className="sc-label">{t('repartition')}</label>
                        {/* Deux méthodes, pas trois : l'API n'en connaît que
                            deux, les libellés en promettaient une de plus. */}
                        <select className="sc-input sc-select" value={lcForm.allocation_method}
                                onChange={e => setLcForm(f => ({ ...f, allocation_method: e.target.value }))}>
                          <option value="equal">{t('parUnite')}</option>
                          <option value="prorata">{t('auProrata')}</option>
                        </select>
                      </div>
                    </div>

                    {/* Sur quels articles reverser le port : un carton
                        volumineux ne doit pas être subventionné par un
                        sachet plat. */}
                    {(() => {
                      const lignes = linesOf(selected).filter((l: any) => l.product_id && Number(l.received_qty) > 0);
                      if (!lignes.length) return null;
                      const montant = parseFloat(lcForm.amount) || 0;
                      const parts = repartir(
                        lignes.map((l: any) => ({
                          key: l.product_id,
                          qty: parseInt(l.received_qty) || 0,
                          unit_cost: parseFloat(l.unit_cost) || 0,
                          retenue: !lcExclus[l.product_id],
                        })),
                        montant,
                        lcForm.allocation_method === 'prorata' ? 'prorata' : 'equal',
                      );
                      const retenues = lignes.filter((l: any) => !lcExclus[l.product_id]).length;
                      return (
                        <div style={{ marginTop: 12, border: `1px solid ${T.borderFaint}`, borderRadius: 7, overflow: 'hidden' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 11px', background: '#FBF9F6' }}>
                            <span className="sc-label" style={{ margin: 0, flex: 1 }}>
                              {t('porteurs')} — {retenues}/{lignes.length}
                            </span>
                            <button className="re-tout" onClick={() => setLcExclus({})}
                                    style={{ border: 'none', background: 'none', color: T.text2b, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline' }}>
                              {t('toutCocher')}
                            </button>
                          </div>
                          {lignes.map((l: any) => {
                            const coche = !lcExclus[l.product_id];
                            const part = parts[l.product_id];
                            return (
                              <label key={l.product_id} className="re-porteur"
                                     style={{ display: 'flex', alignItems: 'center', gap: 9, borderTop: `1px solid ${T.borderFaint}`, cursor: 'pointer', flexWrap: 'wrap' }}>
                                <input type="checkbox" checked={coche}
                                       onChange={e => setLcExclus(x => ({ ...x, [l.product_id]: !e.target.checked }))}
                                       style={{ cursor: 'pointer' }} />
                                <span style={{ flex: 1, fontSize: 12, color: coche ? T.text2 : T.muted, minWidth: 0 }}>
                                  {l.name || l.product_name}
                                  <span className="sc-num" style={{ color: T.muted }}> · {l.received_qty} u.</span>
                                </span>
                                {montant > 0 && coche && part && (
                                  <span className="sc-num" style={{ fontSize: 11.5, color: T.text2b, whiteSpace: 'nowrap' }}>
                                    +{eur(part.parUnite)}/u. → {eur(part.revient)}
                                  </span>
                                )}
                              </label>
                            );
                          })}
                        </div>
                      );
                    })()}

                    <button className="sc-btn sc-btn-green" onClick={saveLandedCost} disabled={lcSaving}
                            style={mobile ? { marginTop: 12, width: '100%', justifyContent: 'center' } : { marginTop: 10 }}>
                      <span className="ms">calculate</span>{lcSaving ? t('imputation') : t('imputer')}
                    </button>

                    {lcResult && lcResult.length > 0 && (
                      <div style={{ marginTop: 12, background: '#F2F5F0', borderRadius: 7, padding: '10px 12px' }}>
                        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: T.muted, marginBottom: 6 }}>
                          {t('nouveauPmp')}
                        </div>
                        {lcResult.map((l: any, i: number) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0' }}>
                            <span>{l.name || l.product_name}</span>
                            <span className="sc-num" style={{ fontWeight: 600 }}>{eur(l.new_cost ?? l.cost_price)}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {landedCosts.length > 0 && (
                      <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${T.borderFaint}` }}>
                        <div className="sc-label">{t('dejaImputes')}</div>
                        {landedCosts.map(lc => (
                          <div key={lc.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0' }}>
                            <span style={{ color: T.text2b }}>{lc.description}</span>
                            <span className="sc-num">{eur(lc.amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
          )}

          {/* ── Historique ─────────────────────────────── */}
          {montrerListe && (
          <div style={{ flex: '1 1 280px', minWidth: 0 }}>
            <div className="sc-card" style={{ overflow: 'hidden' }}>
              <div style={{ padding: '12px 15px', borderBottom: `1px solid ${T.border}` }}>
                <span className="sc-card-title">{t('historique')}</span>
              </div>
              {receptions.map(r => {
                const on = !mobile && selected?.id === r.id;
                return (
                  <button key={r.id} className="re-hist-row" onClick={() => ouvrir(r)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
                      padding: '10px 15px', border: 'none',
                      borderBottom: `1px solid ${T.borderFaint}`,
                      borderLeft: on ? '3px solid var(--accent)' : '3px solid transparent',
                      background: on ? '#fff' : 'transparent',
                    }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="sc-num" style={{ fontSize: mobile ? 15 : 12.5, fontWeight: 600, color: T.ink }}>{r.number}</span>
                      <span style={{ flex: 1 }} />
                      <span className="sc-badge" style={{ background: BADGE.green.bg, color: BADGE.green.fg }}>{r.status || 'reçue'}</span>
                      {mobile && <span className="ms" style={{ fontSize: 22, color: T.muted3 }}>chevron_right</span>}
                    </div>
                    <div className="re-l2" style={{ fontSize: 11, color: T.text2b, marginTop: 2 }}>
                      {supplierOf(r)} · {linesOf(r).length} article(s)
                    </div>
                    <div className="re-l3" style={{ fontSize: 10.5, color: T.muted }}>
                      {fmtDate(r.received_at)}{r.purchase_orders?.number ? ` · ${r.purchase_orders.number}` : ''}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          )}
        </div>
      )}

      {toast && <div className="sc-toast" role="status">{toast}</div>}
    </>
  );
}
