'use client';
import { useEffect, useState } from 'react';
import { adminFetch } from '@/lib/auth-client';
import { T, BADGE } from '@/lib/admin-theme';
import { useT } from '@/lib/admin-i18n';
import { useIsMobile } from '@/lib/use-mobile';
import EmailApercu from '@/components/EmailApercu';
import { TNL } from './i18n';

/* ═══════════════════════════════════════════════════════════════
   NEWSLETTER DE LA SEMAINE (lib/newsletter-hebdo, migration 064)

   À gauche : le réglage on/off, la lettre de cette semaine (date,
   statut, objet) et ses gestes — annuler, réactiver, s'envoyer un test,
   envoyer tout de suite — puis l'historique. À droite : l'aperçu exact,
   dans les trois langues.
   ═══════════════════════════════════════════════════════════════ */

const NL_CSS = `
  .nl-toast { position: fixed; bottom: 24px; right: 24px; background: ${T.ink}; color: #fff; padding: 10px 18px; border-radius: 7px; font-size: 12.5px; z-index: 300; }
  @media (max-width: 899px) {
    .nl-grid { grid-template-columns: minmax(0, 1fr) !important; }
    .nl-actions .sc-btn { min-height: 44px; font-size: 14px !important; }
    .nl-petit { font-size: 13px !important; }
    .nl-toast { left: 12px; right: 12px; bottom: calc(58px + 16px + env(safe-area-inset-bottom)); font-size: 14px; text-align: center; }
  }
`;

const TON: Record<string, keyof typeof BADGE> = { preparee: 'blue', annulee: 'gray', en_cours: 'amber', envoyee: 'green' };

export default function NewsletterPage() {
  const { t, tc, lang } = useT(TNL);
  const mobile = useIsMobile();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState('');
  const [langApercu, setLangApercu] = useState('fr');
  const [html, setHtml] = useState('');
  const [sujet, setSujet] = useState('');

  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 4000); };
  const loc = lang === 'sv' ? 'sv-SE' : lang === 'en' ? 'en-GB' : 'fr-FR';
  const jour = (ymd: string) => new Date(ymd + 'T12:00:00Z').toLocaleDateString(loc, { day: 'numeric', month: 'long', timeZone: 'UTC' });
  const quand = (d?: string | null) => d ? new Date(d).toLocaleString(loc, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

  async function load() {
    setLoading(true);
    try { setData(await adminFetch('/api/admin/newsletter-hebdo').then(r => r.json())); }
    catch { say(t('erreur')); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!data) return;
    adminFetch(`/api/admin/newsletter-hebdo?apercu=1&lang=${langApercu}`).then(async r => {
      setSujet(decodeURIComponent(r.headers.get('X-Sujet') || ''));
      setHtml(await r.text());
    }).catch(() => setHtml(''));
  }, [data, langApercu]);

  async function agir(action: string, valeur?: boolean) {
    if (action === 'envoyer' && !window.confirm(t('confirmerEnvoi').replace('{n}', String(data?.inscrits ?? 0)))) return;
    setBusy(action);
    try {
      const r = await adminFetch('/api/admin/newsletter-hebdo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, valeur }),
      }).then(x => x.json());
      if (r.error) say(r.error);
      else { say(r.message || (r.envoyes != null ? `${t('envoyes')} : ${r.envoyes}` : t('fait'))); await load(); }
    } catch { say(t('erreur')); }
    finally { setBusy(''); }
  }

  const ligne = data?.ligne;
  const statut: string = ligne?.statut || 'aucune';
  const parti = statut === 'en_cours' || statut === 'envoyee';

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: NL_CSS }} />
      <div className="sc-head">
        <div style={{ maxWidth: 760 }}>
          <div className="sc-title">{t('titre')}</div>
          <div className="sc-sub">{t('sousTitre')}</div>
        </div>
        <button className="sc-btn sc-btn-secondary" onClick={load}><span className="ms">refresh</span>{t('actualiser')}</button>
      </div>

      <div className="nl-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,640px)', gap: 12, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 12 }}>

          {/* ── Réglage et lettre de la semaine ───────────────────── */}
          <div className="sc-card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '12px 15px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: T.ink }}>
                {t('auto')}{' '}
                <span className="sc-badge" style={{ marginLeft: 6, background: data?.active ? BADGE.green.bg : BADGE.gray.bg, color: data?.active ? BADGE.green.fg : BADGE.gray.fg }}>
                  {loading ? '…' : data?.active ? t('autoOn') : t('autoOff')}
                </span>
              </div>
              {!loading && (
                <button className={`sc-btn ${data?.active ? 'sc-btn-secondary' : 'sc-btn-primary'}`} disabled={!!busy}
                        style={{ padding: '5px 12px', fontSize: 11.5 }} onClick={() => agir('activer', !data?.active)}>
                  {data?.active ? t('desactiver') : t('activer')}
                </button>
              )}
            </div>

            <div style={{ padding: '12px 15px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 10 }}>
              {[
                [t('envoi'), data ? t('jeudiVers').replace('{d}', jour(data.jeudi)) : '…'],
                [t('statut'), ''],
                [t('inscrits'), data ? `${data.inscrits}${Object.keys(data.parLangue || {}).length > 1 ? ` (${Object.entries(data.parLangue).map(([l, n]) => `${l.toUpperCase()} ${n}`).join(' · ')})` : ''}` : '…'],
              ].map(([k, v], i) => (
                <div key={i}>
                  <div className="nl-petit" style={{ fontSize: 10.5, color: T.muted, fontWeight: 600 }}>{k}</div>
                  {i === 1 ? (
                    <span className="sc-badge" style={{ marginTop: 5, display: 'inline-block', background: BADGE[TON[statut] || 'gray'].bg, color: BADGE[TON[statut] || 'gray'].fg }}>
                      {loading ? '…' : t(('s_' + statut) as any)}
                    </span>
                  ) : (
                    <div className="sc-num" style={{ fontSize: 14.5, fontWeight: 600, color: T.ink, marginTop: 4 }}>{v}</div>
                  )}
                </div>
              ))}
            </div>
            {ligne?.statut === 'en_cours' || ligne?.statut === 'envoyee' ? (
              <div className="nl-petit" style={{ padding: '0 15px 12px', fontSize: 12, color: T.text2b }}>
                {t('envoyes')} : <strong>{ligne.nb_envoyes}</strong>{ligne.nb_echecs ? ` · ${t('echecs')} : ${ligne.nb_echecs}` : ''}
                {ligne.envoi_debut_at ? ` · ${quand(ligne.envoi_debut_at)}` : ''}
              </div>
            ) : null}

            <div className="nl-actions" style={{ padding: '12px 15px', borderTop: `1px solid ${T.borderFaint}`, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {statut === 'annulee' ? (
                <button className="sc-btn sc-btn-primary" disabled={!!busy} onClick={() => agir('reactiver')}>{t('reactiver')}</button>
              ) : !parti && (
                <button className="sc-btn sc-btn-secondary" disabled={!!busy} onClick={() => agir('annuler')}>{t('annuler')}</button>
              )}
              <button className="sc-btn sc-btn-secondary" disabled={!!busy} onClick={() => agir('tester')}>
                <span className="ms">send</span>{t('tester')}
              </button>
              {statut !== 'envoyee' && statut !== 'annulee' && (
                <button className="sc-btn sc-btn-primary" disabled={!!busy || !data?.inscrits} onClick={() => agir('envoyer')}>
                  {busy === 'envoyer' ? '…' : t('envoyer')}
                </button>
              )}
            </div>
            <div className="nl-petit" style={{ padding: '10px 15px', background: T.surfaceAlt, fontSize: 11.5, color: T.muted }}>{t('noteLegale')}</div>
          </div>

          {/* ── Historique ───────────────────────────────────────── */}
          <div className="sc-card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '12px 15px', borderBottom: `1px solid ${T.border}`, fontSize: 12.5, fontWeight: 600, color: T.ink }}>{t('historique')}</div>
            {loading ? <div className="sc-empty">{tc('loading')}</div> : !(data?.historique || []).length ? (
              <div className="sc-empty">{t('aucunHisto')}</div>
            ) : (
              <table className="sc-table sc-stack">
                <thead><tr><th>{t('semaine')}</th><th>{t('sujet')}</th><th style={{ width: 120 }}>{t('statut')}</th><th className="sc-right" style={{ width: 80 }}>{t('envoyes')}</th></tr></thead>
                <tbody>
                  {data.historique.map((h: any) => (
                    <tr key={h.semaine}>
                      <td data-label={t('semaine')}>{jour(h.semaine)}</td>
                      <td className="sc-stack-main" style={{ overflowWrap: 'anywhere' }}>{h.sujet || '—'}</td>
                      <td data-label={t('statut')}>
                        <span className="sc-badge" style={{ background: BADGE[TON[h.statut] || 'gray'].bg, color: BADGE[TON[h.statut] || 'gray'].fg }}>{t(('s_' + h.statut) as any)}</span>
                      </td>
                      <td className="sc-right sc-num" data-label={t('envoyes')}>{h.nb_envoyes || 0}{h.nb_echecs ? ` / ${h.nb_echecs}` : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* ── Aperçu ──────────────────────────────────────────────── */}
        <div className="sc-card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '10px 15px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: T.ink, flex: 1 }}>{t('apercu')}</div>
            <select className="sc-input" style={{ width: 76 }} value={langApercu} aria-label={t('apercu')}
                    onChange={e => setLangApercu(e.target.value)}>
              <option value="fr">FR</option><option value="en">EN</option><option value="sv">SV</option>
            </select>
          </div>
          {sujet && <div className="nl-petit" style={{ padding: '8px 15px', fontSize: 12, color: T.text2b, borderBottom: `1px solid ${T.borderFaint}` }}><strong>{t('sujet')} :</strong> {sujet}</div>}
          <div className="nl-petit" style={{ padding: '8px 15px', fontSize: 11.5, color: T.muted, borderBottom: `1px solid ${T.borderFaint}` }}>{t('apercuAide')}</div>
          <EmailApercu title="apercu-newsletter" html={html} ajuster={mobile} fond="#F1EEE9"
                       style={{ width: '100%', height: 900, border: 0, background: '#F1EEE9' }} />
        </div>
      </div>

      {toast && <div className="nl-toast" role="status">{toast}</div>}
    </>
  );
}
