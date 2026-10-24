'use client';
import { useState } from 'react';
import { adminFetch } from '@/lib/auth-client';
import { C } from './ui';
import { useT } from '@/lib/admin-i18n';
import { TRD, envoiProgramme, modeleInsere } from './i18n-redaction';

/* Fenêtre de rédaction — 660 × 640 en surimpression, comme le handoff.
   Elle porte aussi l'enregistrement en brouillon et la programmation :
   ce sont trois issues du même message, pas trois écrans. */

export type Brouillon = {
  id?: string; to: string; cc: string; subject: string; corps: string;
  repond?: string; pj?: Array<{ filename: string; content: string; taille: number }>;
};

/** Un corps qui contient de vraies balises (modèle inséré) — sinon c'est du texte. */
export const estHtml = (s: string) => /<\s*(html|body|table|div|p|span|a|img|h[1-6]|ul|ol|td|style)\b[^>]*>/i.test(s);

/** Inverse de l'enregistrement : le corps d'un brouillon redevient du texte éditable. */
export const corpsTexte = (html: string) => {
  const t = String(html || '').split('<br />').join('\n');
  return estHtml(t) ? t : t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
};

/* Vercel refuse un corps de requête au-delà de 4,5 Mo ; en base64, les
   pièces jointes pèsent un tiers de plus. Au-delà de 3 Mo de fichiers,
   l'envoi échouait avec un simple « Échec ». */
const PJ_MAX_OCTETS = 3 * 1024 * 1024;

/** Date locale au format attendu par <input type="datetime-local">. */
function dansUneHeure() {
  const d = new Date(Date.now() + 3600_000);
  d.setSeconds(0, 0);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function Redaction(p: {
  valeur: Brouillon;
  carnet: any[];
  modeles: any[];
  mobile: boolean;
  onChange: (b: Brouillon) => void;
  onFermer: () => void;
  onEnvoye: () => void;
  say: (m: string) => void;
}) {
  const { t: tr, lang } = useT(TRD);
  const { valeur: v } = p;
  const [busy, setBusy] = useState('');
  const [quand, setQuand] = useState('');
  const pj = v.pj || [];

  /* Le corps est du texte, sauf quand un modèle (HTML) a été inséré. Le
     texte était injecté tel quel : « prix < 10 € » ou l'adresse
     « <client@…> » d'une citation disparaissaient comme des balises. */
  const corpsHtml = () => (estHtml(v.corps)
    ? v.corps
    : v.corps.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'))
    .split('\n').join('<br />');
  const charge = () => ({
    id: v.id, to: v.to, cc: v.cc, subject: v.subject, corps: corpsHtml(),
    inReplyTo: v.repond, attachments: pj.map(f => ({ filename: f.filename, content: f.content })),
  });

  async function appel(url: string, corps: any, quoi: string) {
    setBusy(quoi);
    try {
      const res = await adminFetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corps),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Échec');
      return d;
    } finally { setBusy(''); }
  }

  async function envoyer() {
    try {
      const d = await appel('/api/inbox/send', { ...charge(), draftId: v.id }, 'envoi');
      p.say(d?.avertissement || 'Message envoyé');
      p.onEnvoye();
    } catch (e: any) { p.say(e.message); }
  }

  async function enregistrer() {
    try {
      const d = await appel('/api/inbox/drafts', charge(), 'brouillon');
      p.onChange({ ...v, id: d.brouillon?.id });
      p.say(tr('msgBrouillon'));
    } catch (e: any) { p.say(e.message); }
  }

  async function programmer() {
    if (!quand) { setQuand(dansUneHeure()); return; }
    try {
      await appel('/api/inbox/scheduled', { ...charge(), sendAt: new Date(quand).toISOString(), draftId: v.id }, 'prog');
      p.say(`${envoiProgramme(quand, lang)} — ${tr('notePrevue')}`);
      p.onEnvoye();
    } catch (e: any) { p.say(e.message); }
  }

  async function inserer(key: string) {
    const t = p.modeles.find(m => m.key === key);
    if (!t) return;
    try {
      const html = await adminFetch('/api/email-templates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: t.html }),
      }).then(r => r.text());
      p.onChange({ ...v, corps: html, subject: v.subject || t.label });
      p.say(modeleInsere(t.label, lang));
    } catch { p.say(tr('msgModeleKo')); }
  }

  async function ajouterPj(files: FileList | null) {
    const liste = Array.from(files || []);
    const total = pj.reduce((s, f) => s + f.taille, 0) + liste.reduce((s, f) => s + f.size, 0);
    if (total > PJ_MAX_OCTETS) {
      p.say(tr('pjTropLourdes'));
      return;
    }
    /* Tous les fichiers d'abord, puis une seule mise à jour : chaque
       onChange repartait de la même valeur `v`, et de trois fichiers
       choisis d'un coup il ne restait que le dernier. */
    const nouveaux: Array<{ filename: string; content: string; taille: number }> = [];
    for (const f of liste) {
      const b64: string = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result).split(',')[1] || '');
        r.onerror = rej;
        r.readAsDataURL(f);
      });
      nouveaux.push({ filename: f.name, content: b64, taille: f.size });
    }
    if (nouveaux.length) p.onChange({ ...v, pj: [...(v.pj || []), ...nouveaux] });
  }

  /* Sur téléphone : champs à 16 px (sinon iOS zoome à la saisie), clavier
     email pour À / Cc, cibles de 44 px. */
  const m = p.mobile;
  const champ = (k: 'to' | 'cc' | 'subject', label: string) => (
    <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, borderBottom: `1px solid ${C.ligne}`, padding: m ? '0' : '9px 0', minHeight: m ? 48 : undefined }}>
      <span style={{ width: 44, fontSize: m ? 14 : 11.5, color: C.t4, flexShrink: 0 }}>{label}</span>
      <input value={v[k]} onChange={e => p.onChange({ ...v, [k]: e.target.value })}
             list={k === 'subject' ? undefined : 'sc-carnet'}
             {...(k === 'subject'
               ? { enterKeyHint: 'next' as const, autoCapitalize: 'sentences' }
               : { inputMode: 'email' as const, autoCapitalize: 'off', autoCorrect: 'off', spellCheck: false, autoComplete: 'off', enterKeyHint: 'next' as const })}
             style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', fontSize: m ? 16 : 13, color: C.t1, fontFamily: 'inherit', background: 'transparent', minHeight: m ? 46 : undefined }} />
    </label>
  );

  const titre = v.repond ? 'Répondre' : v.id ? 'Brouillon' : 'Nouveau message';
  const envoyerLabel = busy === 'envoi' ? 'Envoi…' : 'Envoyer';

  return (
    <div role="dialog" aria-label={titre} style={m ? {
      /* Téléphone : plein écran, au-dessus de la topbar et des onglets.
         « Envoyer » est en haut à droite, comme dans une application
         mail : il reste atteignable quand le clavier couvre le bas. */
      position: 'fixed', inset: 0, height: '100dvh', background: C.surface, zIndex: 250,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)',
    } : {
      position: 'fixed', right: 24, bottom: 24, width: 660, height: 640,
      background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10,
      boxShadow: '0 20px 60px rgba(0,0,0,.22)', zIndex: 250,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <datalist id="sc-carnet">
        {p.carnet.map(c => (
          <option key={c.email} value={c.email}>{c.nom ? `${c.nom} · ${c.type}` : c.type}</option>
        ))}
      </datalist>

      {m ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px 6px 4px', background: C.ink, color: '#fff', flexShrink: 0 }}>
          <button onClick={p.onFermer} aria-label="Fermer"
                  style={{ width: 44, height: 44, border: 'none', background: 'none', cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="ms" style={{ fontSize: 24 }}>close</span>
          </button>
          <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{titre}</span>
          <button className="sc-btn" onClick={envoyer} disabled={!!busy}
                  style={{ background: C.vert, color: '#fff', border: 'none' }}>
            <span className="ms">send</span>{envoyerLabel}
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 15px', background: C.ink, color: '#fff' }}>
          <span className="ms" style={{ fontSize: 18 }}>edit</span>
          <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600 }}>{titre}</span>
          <button onClick={p.onFermer} aria-label="Fermer" style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#fff', lineHeight: 1 }}>
            <span className="ms">close</span>
          </button>
        </div>
      )}

      <div style={{ padding: m ? '0 14px' : '0 15px', flexShrink: 0 }}>
        {champ('to', 'À')}
        {champ('cc', 'Cc')}
        {champ('subject', 'Objet')}
      </div>

      <textarea value={v.corps} onChange={e => p.onChange({ ...v, corps: e.target.value })}
                placeholder={tr('phMessage')} aria-label={tr('phMessage')}
                style={{
                  flex: 1, minHeight: m ? 140 : undefined, border: 'none', outline: 'none', resize: 'none', padding: m ? '14px' : '14px 15px',
                  fontSize: m ? 16 : 14, lineHeight: m ? 1.6 : 1.72, color: C.corps, fontFamily: 'inherit',
                }} />

      {pj.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: m ? '0 14px 10px' : '0 15px 10px', flexShrink: 0 }}>
          {pj.map((f, i) => (
            <span key={i} className="sc-chip" style={{ fontSize: m ? 13 : 11, maxWidth: '100%', cursor: 'default' }}>
              <span className="ms" style={{ fontSize: m ? 17 : 14 }}>attach_file</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.filename}</span> · {Math.round(f.taille / 1024)} ko
              <button onClick={() => p.onChange({ ...v, pj: pj.filter((_, j) => j !== i) })} aria-label={`Retirer ${f.filename}`}
                      style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, marginLeft: 4, lineHeight: 1, ...(m ? { width: 32, height: 32, marginRight: -8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' } : {}) }}>
                <span className="ms" style={{ fontSize: m ? 18 : 14, color: C.t4 }}>close</span>
              </button>
            </span>
          ))}
        </div>
      )}

      {quand && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: m ? '10px 14px' : '9px 15px', background: '#F3EDF3', borderTop: `1px solid ${C.selBord}`, flexWrap: 'wrap', flexShrink: 0 }}>
          <span className="ms" style={{ fontSize: 17, color: C.selTexte }}>schedule_send</span>
          <input type="datetime-local" value={quand} onChange={e => setQuand(e.target.value)} aria-label={tr('programmer')}
                 className="sc-input" style={m ? { flex: '1 1 180px', width: 'auto' } : { height: 30, fontSize: 12 }} />
          <button className="sc-btn sc-btn-primary" style={m ? { flex: '1 1 0', justifyContent: 'center' } : { padding: '5px 11px', fontSize: 11.5 }}
                  onClick={programmer} disabled={busy === 'prog'}>
            {busy === 'prog' ? 'Programmation…' : 'Confirmer'}
          </button>
          <button className="sc-btn sc-btn-secondary" style={m ? { flex: '1 1 0', justifyContent: 'center' } : { padding: '5px 11px', fontSize: 11.5 }} onClick={() => setQuand('')}>
            Annuler
          </button>
          <span style={{ flexBasis: '100%', fontSize: m ? 12.5 : 10.5, color: C.selTexte, lineHeight: 1.45 }}>{tr('notePrevue')}</span>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: m ? 4 : 8, padding: m ? '6px 10px' : '11px 15px', background: '#FBF9F6', borderTop: `1px solid ${C.border}`, flexWrap: 'wrap', flexShrink: 0 }}>
        {!m && (
          <button className="sc-btn" onClick={envoyer} disabled={!!busy}
                  style={{ background: C.vert, color: '#fff', border: 'none' }}>
            <span className="ms">send</span>{envoyerLabel}
          </button>
        )}
        <button className="sc-iconbtn" title={tr('programmer')} aria-label={tr('programmer')} onClick={programmer}>
          <span className="ms">schedule_send</span>
        </button>
        <button className="sc-iconbtn" title={tr('brouillon')} aria-label={tr('brouillon')} onClick={enregistrer} disabled={!!busy}>
          <span className="ms">save</span>
        </button>
        <label className="sc-iconbtn" title={tr('joindre')} aria-label={tr('joindre')} style={{ cursor: 'pointer' }}>
          <span className="ms">attach_file</span>
          <input type="file" multiple hidden onChange={e => { ajouterPj(e.target.files); e.currentTarget.value = ''; }} />
        </label>
        <select onChange={e => { inserer(e.target.value); e.currentTarget.value = ''; }} defaultValue="" aria-label={tr('modele')}
                className="sc-input" style={m ? { flex: '1 1 120px', width: 'auto', minWidth: 0 } : { height: 30, fontSize: 11.5, maxWidth: 160 }}>
          <option value="">{tr('modele')}</option>
          {p.modeles.map(mo => <option key={mo.key} value={mo.key}>{mo.label}</option>)}
        </select>
        {!m && <span style={{ flex: 1 }} />}
        <span style={{ fontSize: m ? 12 : 10.5, color: C.t4, ...(m ? { flexBasis: '100%', padding: '2px 4px 4px' } : {}) }}>{tr('signature')}</span>
      </div>
    </div>
  );
}
