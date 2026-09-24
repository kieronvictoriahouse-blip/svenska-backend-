'use client';
import { useEffect, useMemo, useState } from 'react';
import { adminFetch } from '@/lib/auth-client';
import { T, BADGE } from '@/lib/admin-theme';
import { useT } from '@/lib/admin-i18n';
import { TRL } from './i18n';

/* ═══════════════════════════════════════════════════════════════
   PANIERS ABANDONNÉS — relances et geste de la semaine

   En haut, ce que la relance rapporte (paniers, relancés, récupérés).
   Au milieu, le geste commercial de chaque semaine : un code promo
   existant, un produit offert, ou rien — et à quelle relance il
   s'ajoute. À droite, l'aperçu exact de l'email. En bas, chaque panier
   et son suivi : qui, quoi, relancé quand, revenu ou non.
   ═══════════════════════════════════════════════════════════════ */

const eur = (n: any) =>
  (Number(n) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const dt = (d?: string | null, lang = 'fr') =>
  d ? new Date(d).toLocaleString(lang === 'sv' ? 'sv-SE' : lang === 'en' ? 'en-GB' : 'fr-FR',
    { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
const jour = (ymd: string, lang = 'fr') =>
  new Date(ymd + 'T12:00:00Z').toLocaleDateString(lang === 'sv' ? 'sv-SE' : lang === 'en' ? 'en-GB' : 'fr-FR',
    { day: 'numeric', month: 'long' });

function semainesDepuis(lundi: string, n = 6): string[] {
  const out: string[] = [];
  const d = new Date(lundi + 'T12:00:00Z');
  for (let i = 0; i < n; i++) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 7); }
  return out;
}

type Brouillon = {
  kind: 'none' | 'code' | 'cadeau';
  promo_code_id: string; gift_product_id: string;
  apply_to: 'r1' | 'r2' | 'both'; message_fr: string;
};

export default function RelancesPage() {
  const { t, tc, lang } = useT(TRL);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [edits, setEdits] = useState<Record<string, Brouillon>>({});
  const [busy, setBusy] = useState('');
  const [apercu, setApercu] = useState<{ semaine: string; rang: 1 | 2; lang: string }>({ semaine: '', rang: 1, lang: 'fr' });
  const [html, setHtml] = useState('');
  const [sujet, setSujet] = useState('');

  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3500); };

  async function load() {
    setLoading(true);
    try {
      const r = await adminFetch('/api/admin/relances').then(x => x.json());
      setData(r);
      const e: Record<string, Brouillon> = {};
      for (const w of semainesDepuis(r.lundi)) {
        const o = (r.offres || []).find((x: any) => x.week_start === w);
        e[w] = {
          kind: o?.gift_product_id ? 'cadeau' : o?.promo_code_id ? 'code' : 'none',
          promo_code_id: o?.promo_code_id || '', gift_product_id: o?.gift_product_id || '',
          apply_to: o?.apply_to || 'r2', message_fr: o?.message_fr || '',
        };
      }
      setEdits(e);
      setApercu(a => ({ ...a, semaine: a.semaine || r.lundi }));
    } catch { say(t('erreur')); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  // Aperçu : rechargé à chaque changement de semaine, de relance ou de langue.
  useEffect(() => {
    if (!apercu.semaine) return;
    const q = `?semaine=${apercu.semaine}&rang=${apercu.rang}&lang=${apercu.lang}`;
    adminFetch('/api/admin/relances/apercu' + q).then(async r => {
      setSujet(decodeURIComponent(r.headers.get('X-Sujet') || ''));
      setHtml(await r.text());
    }).catch(() => setHtml(''));
  }, [apercu, data]);

  async function enregistrer(w: string) {
    const b = edits[w];
    setBusy(w);
    try {
      const r = b.kind === 'none' && !(data?.offres || []).some((x: any) => x.week_start === w)
        ? { ok: true }
        : await adminFetch('/api/admin/relances', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ week_start: w, ...b }),
          }).then(x => x.json());
      if (r.error) say(r.error); else { say(t('enregistre')); await load(); setApercu(a => ({ ...a, semaine: w })); }
    } finally { setBusy(''); }
  }

  async function retirer(w: string) {
    setBusy(w);
    try {
      const r = await adminFetch(`/api/admin/relances?week_start=${w}`, { method: 'DELETE' }).then(x => x.json());
      if (r.error) say(r.error); else { say(t('retire')); await load(); }
    } finally { setBusy(''); }
  }

  const set = (w: string, patch: Partial<Brouillon>) => setEdits(e => ({ ...e, [w]: { ...e[w], ...patch } }));
  const semaines = useMemo(() => (data ? semainesDepuis(data.lundi) : []), [data]);
  const codes = (data?.codes || []) as any[];
  const produits = (data?.produits || []).filter((p: any) => !p.track_stock || (Number(p.stock) || 0) > 0) as any[];
  const s = data?.stats || {};

  const label = { fontSize: 11, fontWeight: 600, color: T.text2b, marginBottom: 5, display: 'block' } as const;
  const libCode = (c: any) =>
    `${c.code} — ${c.type === 'percent' ? `−${c.value} %` : c.type === 'fixed' ? `−${eur(c.value)}` : 'port offert'}`
    + (c.min_order ? ` (min. ${eur(c.min_order)})` : '') + (c.is_active ? '' : ` · ${t('inactif')}`);

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ maxWidth: 760 }}>
          <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-.2px', color: T.ink }}>{t('titre')}</div>
          <div style={{ fontSize: 11.5, color: T.text3, marginTop: 2 }}>{t('sousTitre')}</div>
        </div>
        <button className="sc-btn sc-btn-secondary" onClick={load}><span className="ms">refresh</span>{t('actualiser')}</button>
      </div>

      {/* ── Chiffres ─────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginBottom: 12 }}>
        {[
          [t('kPaniers'), `${s.paniers ?? '—'}`, s.valeur != null ? eur(s.valeur) : ''],
          [t('kAvecEmail'), `${s.avec_email ?? '—'}`, ''],
          [t('kRelances'), `${s.relances ?? '—'}`, ''],
          [t('kRecuperes'), `${s.recuperes ?? '—'}`, ''],
          [t('kCaRecupere'), s.ca_recupere != null ? eur(s.ca_recupere) : '—', ''],
        ].map(([k, v, sub], i) => (
          <div key={i} className="sc-card" style={{ padding: '12px 14px' }}>
            <div style={{ fontSize: 10.5, color: T.muted, fontWeight: 600, letterSpacing: '.2px' }}>{k}</div>
            <div className="sc-num" style={{ fontSize: 20, fontWeight: 600, color: T.ink, marginTop: 4 }}>{loading ? '…' : v}</div>
            {sub && <div style={{ fontSize: 11, color: T.muted }}>{sub}</div>}
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,640px)', gap: 12, alignItems: 'start', marginBottom: 12 }}>

        {/* ── Geste de la semaine ─────────────────────────────── */}
        <div className="sc-card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '12px 15px', borderBottom: `1px solid ${T.border}`, fontSize: 12.5, fontWeight: 600, color: T.ink }}>
            {t('gesteTitre')}
          </div>
          {!loading && !codes.length && (
            <div style={{ padding: '10px 15px', fontSize: 11.5, color: T.muted, background: T.surfaceAlt }}>{t('aucunCode')}</div>
          )}
          {semaines.map((w, i) => {
            const b = edits[w];
            if (!b) return null;
            const existe = (data?.offres || []).some((x: any) => x.week_start === w);
            return (
              <div key={w} style={{ padding: '12px 15px', borderBottom: `1px solid ${T.borderFaint}`, background: apercu.semaine === w ? T.surfaceAlt : undefined }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                  <button onClick={() => setApercu(a => ({ ...a, semaine: w }))}
                          style={{ all: 'unset', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: T.ink }}>
                    {t('semaineDu')} {jour(w, lang)}
                    {i === 0 && <span className="sc-badge" style={{ marginLeft: 8, background: BADGE.green.bg, color: BADGE.green.fg }}>{t('enCours')}</span>}
                  </button>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {existe && (
                      <button className="sc-btn sc-btn-secondary" style={{ padding: '4px 9px', fontSize: 11 }}
                              disabled={busy === w} onClick={() => retirer(w)}>{t('retirer')}</button>
                    )}
                    <button className="sc-btn sc-btn-primary" style={{ padding: '4px 11px', fontSize: 11 }}
                            disabled={busy === w} onClick={() => enregistrer(w)}>{t('enregistrer')}</button>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '150px minmax(0,1fr)', gap: 8 }}>
                  <select className="sc-input" value={b.kind} onChange={e => set(w, { kind: e.target.value as Brouillon['kind'] })}>
                    <option value="none">{t('rien')}</option>
                    <option value="code">{t('code')}</option>
                    <option value="cadeau">{t('cadeau')}</option>
                  </select>
                  {b.kind === 'code' && (
                    <select className="sc-input" value={b.promo_code_id} onChange={e => set(w, { promo_code_id: e.target.value })}>
                      <option value="">{t('choisirCode')}</option>
                      {codes.map(c => <option key={c.id} value={c.id}>{libCode(c)}</option>)}
                    </select>
                  )}
                  {b.kind === 'cadeau' && (
                    <select className="sc-input" value={b.gift_product_id} onChange={e => set(w, { gift_product_id: e.target.value })}>
                      <option value="">{t('choisirProduit')}</option>
                      {produits.map(p => (
                        <option key={p.id} value={p.id}>{p.name_fr}{p.track_stock ? ` (${p.stock})` : ''}</option>
                      ))}
                    </select>
                  )}
                  {b.kind === 'none' && <div />}
                </div>
                {b.kind !== 'none' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '150px minmax(0,1fr)', gap: 8, marginTop: 8 }}>
                    <div>
                      <label style={label}>{t('surQuelle')}</label>
                      <select className="sc-input" style={{ width: '100%' }} value={b.apply_to}
                              onChange={e => set(w, { apply_to: e.target.value as Brouillon['apply_to'] })}>
                        <option value="r2">{t('r2')}</option>
                        <option value="r1">{t('r1')}</option>
                        <option value="both">{t('both')}</option>
                      </select>
                    </div>
                    <div>
                      <label style={label}>{t('message')}</label>
                      <input className="sc-input" style={{ width: '100%' }} value={b.message_fr}
                             placeholder={t('messageAide')} onChange={e => set(w, { message_fr: e.target.value })} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <div style={{ padding: '11px 15px', background: T.surfaceAlt, fontSize: 11.5, color: T.muted }}>{t('noteLegale')}</div>
        </div>

        {/* ── Aperçu ──────────────────────────────────────────── */}
        <div className="sc-card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '10px 15px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: T.ink, flex: 1 }}>
              {t('apercu')}{apercu.semaine && <span style={{ fontWeight: 400, color: T.muted }}> · {jour(apercu.semaine, lang)}</span>}
            </div>
            {[1, 2].map(r => (
              <button key={r} className={`sc-btn ${apercu.rang === r ? 'sc-btn-primary' : 'sc-btn-secondary'}`}
                      style={{ padding: '4px 10px', fontSize: 11 }}
                      onClick={() => setApercu(a => ({ ...a, rang: r as 1 | 2 }))}>
                {t(r === 1 ? 'relance1' : 'relance2')}
              </button>
            ))}
            <select className="sc-input" style={{ width: 70 }} value={apercu.lang}
                    onChange={e => setApercu(a => ({ ...a, lang: e.target.value }))}>
              <option value="fr">FR</option><option value="en">EN</option><option value="sv">SV</option>
            </select>
          </div>
          {sujet && <div style={{ padding: '8px 15px', fontSize: 12, color: T.text2b, borderBottom: `1px solid ${T.borderFaint}` }}><strong>{t('sujet')} :</strong> {sujet}</div>}
          <iframe title="apercu" srcDoc={html} style={{ width: '100%', height: 760, border: 0, background: '#F1EEE9' }} />
        </div>
      </div>

      {/* ── Les paniers ─────────────────────────────────────────── */}
      <div className="sc-card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '12px 15px', borderBottom: `1px solid ${T.border}`, fontSize: 12.5, fontWeight: 600, color: T.ink }}>{t('paniersTitre')}</div>
        {loading ? <div className="sc-empty">{tc('loading')}</div> : !(data?.paniers || []).length ? (
          <div className="sc-empty">{t('aucunPanier')}</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="sc-table">
              <thead>
                <tr>
                  <th style={{ width: 96 }}>{t('colDate')}</th>
                  <th style={{ width: 220 }}>{t('colClient')}</th>
                  <th>{t('colPanier')}</th>
                  <th style={{ width: 90, textAlign: 'right' }}>{t('colMontant')}</th>
                  <th style={{ width: 260 }}>{t('colSuivi')}</th>
                </tr>
              </thead>
              <tbody>
                {(data.paniers as any[]).map(p => (
                  <tr key={p.id}>
                    <td className="sc-num" style={{ fontSize: 12 }}>{dt(p.cree, lang)}</td>
                    <td style={{ fontSize: 12.5, color: p.email ? T.ink : T.muted }}>
                      {p.email ? <a href={`mailto:${p.email}`} style={{ color: 'inherit' }}>{p.email}</a> : t('sansEmail')}
                    </td>
                    <td style={{ fontSize: 12, color: T.text2b }}>{p.articles || '—'}</td>
                    <td className="sc-num" style={{ textAlign: 'right', fontSize: 12.5 }}>{eur(p.total)}</td>
                    <td style={{ fontSize: 11.5 }}>
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                        {p.recupere && (
                          <span className="sc-badge" style={{ background: BADGE.green.bg, color: BADGE.green.fg }}>
                            {t('recupere')}{p.commande_recuperee ? ` · ${p.commande_recuperee.order_number} · ${eur(p.commande_recuperee.total)}` : ''}
                          </span>
                        )}
                        {p.r1 && <span className="sc-badge" style={{ background: BADGE.blue.bg, color: BADGE.blue.fg }}>R1 {dt(p.r1, lang)}</span>}
                        {p.r2 && <span className="sc-badge" style={{ background: BADGE.plum.bg, color: BADGE.plum.fg }}>R2 {dt(p.r2, lang)}</span>}
                        {!p.r1 && !p.raison && p.email && p.relancable && <span style={{ color: T.muted }}>{t('enAttente')}</span>}
                        {!p.relancable && p.email && <span style={{ color: T.muted }}>{t('avantRelance')}</span>}
                        {p.raison && <span style={{ color: T.muted }}>{p.raison}</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
