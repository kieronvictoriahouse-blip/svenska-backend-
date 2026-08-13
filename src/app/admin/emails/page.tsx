'use client';
import { useEffect, useState } from 'react';
import { adminFetch } from '@/lib/auth-client';
import { T } from '@/lib/admin-theme';

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
  const modifieLocalement = !!courant && (html !== courant.html || subject !== courant.subject);

  async function load(keepSel = true) {
    try {
      const d = await adminFetch('/api/email-templates').then(r => r.json());
      const list: Tpl[] = d.templates || [];
      setTpls(list);
      const k = keepSel && sel ? sel : (list[0]?.key || '');
      const t = list.find(x => x.key === k);
      setSel(k); setHtml(t?.html || ''); setSubject(t?.subject || '');
    } catch { say('Chargement impossible'); }
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
      say('Gabarit enregistré');
      await load();
    } catch (e: any) { setErreur(e.message); }
    finally { setBusy(false); }
  }

  async function reinitialiser() {
    if (!window.confirm('Revenir au modèle d’origine ? Tes modifications seront perdues.')) return;
    setBusy(true); setErreur('');
    try {
      const res = await adminFetch(`/api/email-templates?key=${encodeURIComponent(sel)}`, { method: 'DELETE' });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Erreur');
      setHtml(d.html || ''); setSubject('');
      say('Modèle d’origine restauré');
      await load();
    } catch (e: any) { setErreur(e.message); }
    finally { setBusy(false); }
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-.2px', color: T.ink }}>Emails</div>
          <div style={{ fontSize: 11.5, color: T.text3, marginTop: 2 }}>
            Les modèles livrés servent de référence — tu ne modifies que ce que tu veux changer.
          </div>
        </div>
        <div className="sc-actions">
          <button className="sc-btn sc-btn-secondary" onClick={previsualiser} disabled={busy}>
            <span className="ms">visibility</span>Aperçu
          </button>
          {courant?.modifie && (
            <button className="sc-btn sc-btn-secondary" onClick={reinitialiser} disabled={busy}>
              <span className="ms">restart_alt</span>Revenir au modèle
            </button>
          )}
          <button className="sc-btn sc-btn-green" onClick={enregistrer} disabled={busy || !modifieLocalement}>
            <span className="ms">save</span>{busy ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,230px) minmax(0,1fr)', gap: 12, alignItems: 'start' }}>

        {/* ── Liste des gabarits ───────────────────────────── */}
        <div className="sc-card" style={{ overflow: 'hidden' }}>
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
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: T.text2b, marginBottom: 5 }}>
              Objet du message
            </label>
            <input className="sc-input" style={{ width: '100%' }} value={subject}
                   placeholder="Laisse vide pour l’objet calculé automatiquement"
                   onChange={e => setSubject(e.target.value)} />

            {courant && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: T.muted, marginBottom: 6 }}>
                  Variables disponibles
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {courant.variables.map(v => (
                    <code key={v} className="sc-chip" style={{ fontSize: 10.5 }}>{`{{ ${v} }}`}</code>
                  ))}
                </div>
                <div style={{ fontSize: 10.5, color: T.muted, marginTop: 7, lineHeight: 1.5 }}>
                  Les listes se répètent entre <code>&lt;!--#each lignes--&gt;</code> et <code>&lt;!--/each--&gt;</code>.
                  Une balise inconnue fait refuser l’enregistrement : elle partirait telle quelle chez le client.
                </div>
              </div>
            )}
          </div>

          <div className="sc-card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '9px 13px', borderBottom: `1px solid ${T.border}`, fontSize: 11.5, color: T.muted }}>
              HTML du message {modifieLocalement && <strong style={{ color: 'var(--accent)' }}>· non enregistré</strong>}
            </div>
            <textarea value={html} onChange={e => setHtml(e.target.value)} spellCheck={false}
                      style={{
                        width: '100%', height: 340, border: 'none', outline: 'none', resize: 'vertical',
                        padding: 13, fontSize: 11.5, lineHeight: 1.55, fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
                        color: T.ink, background: '#fff',
                      }} />
          </div>

          {apercu && (
            <div className="sc-card" style={{ overflow: 'hidden' }}>
              <div style={{ padding: '9px 13px', borderBottom: `1px solid ${T.border}`, fontSize: 11.5, color: T.muted }}>
                Aperçu avec des données d’exemple
              </div>
              {/* Iframe isolée : le HTML d'un email ne doit pas déteindre sur le back-office. */}
              <iframe srcDoc={apercu} title="Aperçu" style={{ width: '100%', height: 620, border: 'none', background: '#F1EEE9' }} />
            </div>
          )}
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
