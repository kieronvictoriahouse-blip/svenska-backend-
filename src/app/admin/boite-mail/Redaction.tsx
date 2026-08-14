'use client';
import { useState } from 'react';
import { adminFetch } from '@/lib/auth-client';
import { C } from './ui';

/* Fenêtre de rédaction — 660 × 640 en surimpression, comme le handoff.
   Elle porte aussi l'enregistrement en brouillon et la programmation :
   ce sont trois issues du même message, pas trois écrans. */

export type Brouillon = {
  id?: string; to: string; cc: string; subject: string; corps: string;
  repond?: string; pj?: Array<{ filename: string; content: string; taille: number }>;
};

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
  const { valeur: v } = p;
  const [busy, setBusy] = useState('');
  const [quand, setQuand] = useState('');
  const pj = v.pj || [];

  const corpsHtml = () => v.corps.split('\n').join('<br />');
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
      p.say('Brouillon enregistré');
    } catch (e: any) { p.say(e.message); }
  }

  async function programmer() {
    if (!quand) { setQuand(dansUneHeure()); return; }
    try {
      await appel('/api/inbox/scheduled', { ...charge(), sendAt: new Date(quand).toISOString(), draftId: v.id }, 'prog');
      p.say(`Envoi programmé pour le ${new Date(quand).toLocaleString('fr-FR', { day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' })}`);
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
      p.say(`Modèle « ${t.label} » inséré — relis avant d’envoyer`);
    } catch { p.say('Modèle illisible'); }
  }

  async function ajouterPj(files: FileList | null) {
    for (const f of Array.from(files || [])) {
      const b64: string = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result).split(',')[1] || '');
        r.onerror = rej;
        r.readAsDataURL(f);
      });
      p.onChange({ ...v, pj: [...(v.pj || []), { filename: f.name, content: b64, taille: f.size }] });
    }
  }

  const champ = (k: 'to' | 'cc' | 'subject', label: string) => (
    <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, borderBottom: `1px solid ${C.ligne}`, padding: '9px 0' }}>
      <span style={{ width: 44, fontSize: 11.5, color: C.t4, flexShrink: 0 }}>{label}</span>
      <input value={v[k]} onChange={e => p.onChange({ ...v, [k]: e.target.value })}
             list={k === 'subject' ? undefined : 'sc-carnet'}
             style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', fontSize: 13, color: C.t1, fontFamily: 'inherit', background: 'transparent' }} />
    </div>
  );

  return (
    <div style={{
      position: 'fixed', right: p.mobile ? 8 : 24, bottom: p.mobile ? 66 : 24,
      width: p.mobile ? 'calc(100vw - 16px)' : 660,
      height: p.mobile ? 'calc(100vh - 130px)' : 640,
      background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10,
      boxShadow: '0 20px 60px rgba(0,0,0,.22)', zIndex: 250,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <datalist id="sc-carnet">
        {p.carnet.map(c => (
          <option key={c.email} value={c.email}>{c.nom ? `${c.nom} · ${c.type}` : c.type}</option>
        ))}
      </datalist>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 15px', background: C.ink, color: '#fff' }}>
        <span className="ms" style={{ fontSize: 18 }}>edit</span>
        <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600 }}>
          {v.repond ? 'Répondre' : v.id ? 'Brouillon' : 'Nouveau message'}
        </span>
        <button onClick={p.onFermer} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#fff', lineHeight: 1 }}>
          <span className="ms">close</span>
        </button>
      </div>

      <div style={{ padding: '0 15px' }}>
        {champ('to', 'À')}
        {champ('cc', 'Cc')}
        {champ('subject', 'Objet')}
      </div>

      <textarea value={v.corps} onChange={e => p.onChange({ ...v, corps: e.target.value })}
                placeholder="Écris ton message…"
                style={{
                  flex: 1, border: 'none', outline: 'none', resize: 'none', padding: '14px 15px',
                  fontSize: 14, lineHeight: 1.72, color: C.corps, fontFamily: 'inherit',
                }} />

      {pj.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '0 15px 10px' }}>
          {pj.map((f, i) => (
            <span key={i} className="sc-chip" style={{ fontSize: 11 }}>
              <span className="ms" style={{ fontSize: 14 }}>attach_file</span>
              {f.filename} · {Math.round(f.taille / 1024)} ko
              <button onClick={() => p.onChange({ ...v, pj: pj.filter((_, j) => j !== i) })}
                      style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, marginLeft: 4, lineHeight: 1 }}>
                <span className="ms" style={{ fontSize: 14, color: C.t4 }}>close</span>
              </button>
            </span>
          ))}
        </div>
      )}

      {quand && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 15px', background: '#F3EDF3', borderTop: `1px solid ${C.selBord}` }}>
          <span className="ms" style={{ fontSize: 17, color: C.selTexte }}>schedule_send</span>
          <input type="datetime-local" value={quand} onChange={e => setQuand(e.target.value)}
                 className="sc-input" style={{ height: 30, fontSize: 12 }} />
          <button className="sc-btn sc-btn-primary" style={{ padding: '5px 11px', fontSize: 11.5 }}
                  onClick={programmer} disabled={busy === 'prog'}>
            {busy === 'prog' ? 'Programmation…' : 'Confirmer'}
          </button>
          <button className="sc-btn sc-btn-secondary" style={{ padding: '5px 11px', fontSize: 11.5 }} onClick={() => setQuand('')}>
            Annuler
          </button>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 15px', background: '#FBF9F6', borderTop: `1px solid ${C.border}`, flexWrap: 'wrap' }}>
        <button className="sc-btn" onClick={envoyer} disabled={!!busy}
                style={{ background: C.vert, color: '#fff', border: 'none' }}>
          <span className="ms">send</span>{busy === 'envoi' ? 'Envoi…' : 'Envoyer'}
        </button>
        <button className="sc-iconbtn" title="Programmer l’envoi" onClick={programmer}>
          <span className="ms">schedule_send</span>
        </button>
        <button className="sc-iconbtn" title="Enregistrer comme brouillon" onClick={enregistrer} disabled={!!busy}>
          <span className="ms">save</span>
        </button>
        <label className="sc-iconbtn" title="Joindre un fichier" style={{ cursor: 'pointer' }}>
          <span className="ms">attach_file</span>
          <input type="file" multiple hidden onChange={e => { ajouterPj(e.target.files); e.currentTarget.value = ''; }} />
        </label>
        <select onChange={e => { inserer(e.target.value); e.currentTarget.value = ''; }} defaultValue=""
                className="sc-input" style={{ height: 30, fontSize: 11.5, maxWidth: 160 }}>
          <option value="">Modèle…</option>
          {p.modeles.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 10.5, color: C.t4 }}>Signature ajoutée à l’envoi</span>
      </div>
    </div>
  );
}
