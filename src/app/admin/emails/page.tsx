'use client';
import { useEffect, useRef, useState } from 'react';
import { adminFetch } from '@/lib/auth-client';
import { T } from '@/lib/admin-theme';
import { useT } from '@/lib/admin-i18n';
import { useIsMobile } from '@/lib/use-mobile';
import EmailApercu from '@/components/EmailApercu';
import { TEM } from './i18n';

/* Téléphone (< 900 px) : le choix du gabarit devient une liste
   déroulante (huit lignes de liste avant l'éditeur, c'était un écran
   entier), Aperçu / Enregistrer restent collés en bas à portée de
   pouce, le HTML s'édite en 16 px (pas de zoom iOS) et l'aperçu est
   réduit à la largeur de l'écran. */
const EM_CSS = `
  .em-toast { position: fixed; bottom: 24px; right: 24px; background: ${T.ink}; color: #fff; padding: 10px 18px; border-radius: 7px; font-size: 12.5px; z-index: 300; }
  @media (max-width: 899px) {
    .em-grid { grid-template-columns: minmax(0, 1fr) !important; }
    .em-var { height: auto !important; min-height: 30px; padding: 4px 9px !important; font-size: 12.5px !important; cursor: default !important; }
    .em-petit { font-size: 12.5px !important; }
    .em-html { font-size: 16px !important; height: 50vh !important; min-height: 280px; }
    .em-toast { left: 12px; right: 12px; bottom: calc(58px + 80px + env(safe-area-inset-bottom)); font-size: 14px; padding: 12px 16px; text-align: center; }
  }
`;

/* ═══════════════════════════════════════════════════════════════
   ÉDITION DES EMAILS

   Le fichier livré reste la référence ; on n'enregistre que ce qui a
   été modifié, et « Revenir au modèle » supprime simplement la
   surcharge.

   L'aperçu est rendu dans une iframe isolée : le HTML d'un email est
   plein de styles en ligne et de tables, il ne doit surtout pas
   déteindre sur le back-office.
   ═══════════════════════════════════════════════════════════════ */

type Tpl = {
  key: string; label: string; variables: string[];
  html: string; defaut: string; subject: string; modifie: boolean;
};

export default function EmailsPage() {
  const { t, tc, lang } = useT(TEM);
  const mobile = useIsMobile();
  const [tpls, setTpls] = useState<Tpl[]>([]);
  const [sel, setSel] = useState('');
  const [html, setHtml] = useState('');
  const [subject, setSubject] = useState('');
  const [apercu, setApercu] = useState('');
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState('');
  const [toast, setToast] = useState('');

  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3500); };
  const courant = tpls.find(t => t.key === sel);

  // Sur téléphone, l'aperçu s'ouvre sous l'éditeur : on y descend.
  const blocApercu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (mobile && apercu) blocApercu.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [apercu, mobile]);
  const modifieLocalement = !!courant && (html !== courant.html || subject !== courant.subject);

  async function load(keepSel = true) {
    try {
      const d = await adminFetch('/api/email-templates').then(r => r.json());
      const list: Tpl[] = d.templates || [];
      setTpls(list);
      const k = keepSel && sel ? sel : (list[0]?.key || '');
      const t = list.find(x => x.key === k);
      setSel(k); setHtml(t?.html || ''); setSubject(t?.subject || '');
    } catch { say(t('msgChargement')); }
  }
  useEffect(() => { load(false); }, []);

  function choisir(k: string) {
    const t = tpls.find(x => x.key === k);
    setSel(k); setHtml(t?.html || ''); setSubject(t?.subject || '');
    setErreur(''); setApercu('');
  }

  async function previsualiser() {
    setBusy(true); setErreur('');
    try {
      const res = await adminFetch('/api/email-templates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html }),
      });
      setApercu(await res.text());
    } catch (e: any) { setErreur(e.message); }
    finally { setBusy(false); }
  }

  async function enregistrer() {
    setBusy(true); setErreur('');
    try {
      const res = await adminFetch('/api/email-templates', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: sel, html, subject }),
      });
      const d = await res.json();
      if (!res.ok) { setErreur(d.error || 'Enregistrement refusé'); return; }
      say(t('msgEnregistre'));
      await load();
    } catch (e: any) { setErreur(e.message); }
    finally { setBusy(false); }
  }

  async function reinitialiser() {
    if (!window.confirm(t('msgConfirmReset'))) return;
    setBusy(true); setErreur('');
    try {
      const res = await adminFetch(`/api/email-templates?key=${encodeURIComponent(sel)}`, { method: 'DELETE' });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Erreur');
      setHtml(d.html || ''); setSubject('');
      say(t('msgRestaure'));
      await load();
    } catch (e: any) { setErreur(e.message); }
    finally { setBusy(false); }
  }

  /* Les trois actions : en tête sur ordinateur, collées en bas sur
     téléphone (on les cherche après avoir modifié le HTML, plus bas). */
  const boutons = (
    <>
      <button className="sc-btn sc-btn-secondary" onClick={previsualiser} disabled={busy}>
        <span className="ms">visibility</span>{t('apercu')}
      </button>
      {courant?.modifie && (
        <button className="sc-btn sc-btn-secondary" onClick={reinitialiser} disabled={busy}>
          <span className="ms">restart_alt</span>{t('revenirModele')}
        </button>
      )}
      <button className="sc-btn sc-btn-green" onClick={enregistrer} disabled={busy || !modifieLocalement}>
        <span className="ms">save</span>{busy ? 'Enregistrement…' : 'Enregistrer'}
      </button>
    </>
  );

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: EM_CSS }} />
      {/* Mêmes valeurs que les styles en ligne d'avant, par les classes du
          shell : elles s'adaptent au téléphone. */}
      <div className="sc-head">
        <div>
          <div className="sc-title">{t('titre')}</div>
          <div className="sc-sub">
            Les modèles livrés servent de référence — tu ne modifies que ce que tu veux changer.
          </div>
        </div>
        {!mobile && <div className="sc-actions">{boutons}</div>}
      </div>

      <div className="em-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,230px) minmax(0,1fr)', gap: 12, alignItems: 'start' }}>

        {/* ── Choix du gabarit : liste déroulante sur téléphone ── */}
        {mobile && (
          <div>
            <label className="sc-label" htmlFor="em-gabarit">Gabarit</label>
            <select id="em-gabarit" className="sc-select" value={sel} onChange={e => choisir(e.target.value)}>
              {tpls.map(x => (
                <option key={x.key} value={x.key}>{x.label}{x.modifie ? ' · personnalisé' : ''}</option>
              ))}
            </select>
          </div>
        )}

        {/* ── Liste des gabarits ───────────────────────────── */}
        <div className="sc-card sc-hide-mobile" style={{ overflow: 'hidden' }}>
          {tpls.map(t => (
            <button key={t.key} onClick={() => choisir(t.key)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
                      border: 'none', background: sel === t.key ? '#FDFBFD' : 'transparent',
                      boxShadow: sel === t.key ? 'inset 3px 0 0 var(--accent)' : 'none',
                      borderBottom: `1px solid ${T.borderFaint}`, padding: '10px 13px', fontFamily: 'inherit',
                    }}>
              <div style={{ fontSize: 12.5, color: sel === t.key ? 'var(--accent)' : T.ink, fontWeight: sel === t.key ? 600 : 400 }}>
                {t.label}
              </div>
              <div style={{ fontSize: 10.5, color: T.muted, marginTop: 2 }}>
                {t.modifie ? 'Personnalisé' : 'Modèle d’origine'}
              </div>
            </button>
          ))}
        </div>

        {/* ── Édition ──────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          {erreur && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 8, background: '#FBE7E4',
              border: '1px solid #EBD5D1', borderRadius: 8, padding: '10px 13px', fontSize: 12, color: '#8C3A2E',
            }}>
              <span className="ms" style={{ fontSize: 17 }}>error</span>{erreur}
            </div>
          )}

          <div className="sc-card" style={{ padding: 15 }}>
            <label htmlFor="em-objet" className="em-petit" style={{ display: 'block', fontSize: 11, fontWeight: 600, color: T.text2b, marginBottom: 5 }}>
              Objet du message
            </label>
            <input id="em-objet" className="sc-input" style={{ width: '100%' }} value={subject}
                   placeholder={t('phObjet')}
                   onChange={e => setSubject(e.target.value)} />

            {courant && (
              <div style={{ marginTop: 12 }}>
                <div className="em-petit" style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: T.muted, marginBottom: 6 }}>
                  Variables disponibles
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {courant.variables.map(v => (
                    <code key={v} className="sc-chip em-var" style={{ fontSize: 10.5 }}>{`{{ ${v} }}`}</code>
                  ))}
                </div>
                <div className="em-petit" style={{ fontSize: 10.5, color: T.muted, marginTop: 7, lineHeight: 1.5 }}>
                  Les listes se répètent entre <code>&lt;!--#each lignes--&gt;</code> et <code>&lt;!--/each--&gt;</code>.
                  Une balise inconnue fait refuser l’enregistrement : elle partirait telle quelle chez le client.
                </div>
              </div>
            )}
          </div>

          <div className="sc-card" style={{ overflow: 'hidden' }}>
            <div className="em-petit" style={{ padding: '9px 13px', borderBottom: `1px solid ${T.border}`, fontSize: 11.5, color: T.muted }}>
              HTML du message {modifieLocalement && <strong style={{ color: 'var(--accent)' }}>· non enregistré</strong>}
            </div>
            <textarea value={html} onChange={e => setHtml(e.target.value)} spellCheck={false} className="em-html"
                      autoCapitalize="off" autoCorrect="off" aria-label="HTML du message"
                      style={{
                        width: '100%', height: 340, border: 'none', outline: 'none', resize: 'vertical',
                        padding: 13, fontSize: 11.5, lineHeight: 1.55, fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
                        color: T.ink, background: '#fff',
                      }} />
          </div>

          {apercu && (
            <div ref={blocApercu} className="sc-card" style={{ overflow: 'hidden', scrollMarginTop: 12 }}>
              <div className="em-petit" style={{ padding: '9px 13px', borderBottom: `1px solid ${T.border}`, fontSize: 11.5, color: T.muted }}>
                Aperçu avec des données d’exemple
              </div>
              {/* Iframe isolée : le HTML d'un email ne doit pas déteindre sur le back-office.
                  Sur téléphone, réduite à la largeur de l'écran. */}
              <EmailApercu html={apercu} title={t('apercu')} ajuster={mobile} fond="#F1EEE9"
                           style={{ width: '100%', height: 620, border: 'none', background: '#F1EEE9' }} />
            </div>
          )}
        </div>
      </div>

      {mobile && <div className="sc-sticky-actions">{boutons}</div>}

      {toast && <div className="em-toast" role="status">{toast}</div>}
    </>
  );
}
