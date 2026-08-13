'use client';
import { useEffect, useMemo, useState } from 'react';
import { adminFetch } from '@/lib/auth-client';

/* ═══════════════════════════════════════════════════════════════
   BOÎTE MAIL — hej@swedishcravings.fr

   Trois panneaux : dossiers 228 px · liste 392 px (340 sous 1320 px)
   · lecture. Les seuils sont calculés en JS et non en media query,
   comme le demande le handoff : la largeur sert aussi à décider de la
   bascule mobile, qu'une media query ne saurait pas exposer au reste
   de la logique.

   Le cache local répond tout de suite ; « Envoyer / recevoir » va
   chercher le nouveau. Le plan Vercel n'autorisant qu'un cron par
   jour, cette relève manuelle est le mode normal.
   ═══════════════════════════════════════════════════════════════ */

const C = {
  ink: '#1C2028', sidebar: '#FCFAF7', lecture: '#F1EEE9', surface: '#FFFFFF',
  border: '#E7E1D8', ligne: '#F1EDE7', ligneFaible: '#F6F3EE', champ: '#E1DBD2',
  t1: '#1C2028', corps: '#3A3630', t2: '#5A5248', t3: '#6E6459',
  t4: '#8B7E72', t5: '#9C9184', t6: '#A79C8E',
  accent: '#7B4F7B', accentFond: '#7B4F7B14', accentBord: '#7B4F7B66',
  selFond: '#F3EDF3', selBord: '#E3D6E3', selTexte: '#5E3B5E',
  etoile: '#C9A227', vert: '#3E5238',
};

const COULEUR_ETIQ: Record<string, string> = {
  Clients: '#7B4F7B', Fournisseurs: '#1C4E80', Logistique: '#3E5238',
  'Comptabilité': '#8A5B08', Marketing: '#A6501F',
};
const couleurDe = (l?: string | null) => (l && COULEUR_ETIQ[l]) || '#857C71';

const initiales = (s?: string | null) =>
  String(s || '?').trim().split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();

function quand(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso), now = new Date();
  const memeJour = d.toDateString() === now.toDateString();
  if (memeJour) return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const an = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString('fr-FR', an ? { day: '2-digit', month: 'short' } : { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function depuis(iso?: string | null) {
  if (!iso) return 'jamais';
  const m = Math.floor((Date.now() - +new Date(iso)) / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  return h < 24 ? `il y a ${h} h` : `il y a ${Math.floor(h / 24)} j`;
}

type Msg = {
  id: string; folder: string; uid: number; from_name?: string; from_email?: string;
  subject?: string; preview?: string; seen: boolean; flagged: boolean;
  label?: string | null; attachments?: any[]; sent_at?: string;
  body_html?: string; body_text?: string; to_emails?: string[];
};

const VUES = [
  { id: 'INBOX', icone: 'inbox', label: 'Réception', compteur: 'nonLus' },
  { id: 'unread', icone: 'mark_email_unread', label: 'Non lus', compteur: 'nonLus' },
  { id: 'starred', icone: 'star', label: 'Suivis', compteur: 'suivis' },
];

export default function BoiteMailPage() {
  const [vue, setVue] = useState('INBOX');
  const [filtre, setFiltre] = useState('tous');
  const [q, setQ] = useState('');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [compteurs, setCompteurs] = useState<any>({ nonLus: 0, suivis: 0 });
  const [etat, setEtat] = useState<any[]>([]);
  const [ouvert, setOuvert] = useState<Msg | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [chargement, setChargement] = useState(true);
  const [synchro, setSynchro] = useState(false);
  const [toast, setToast] = useState('');
  const [w, setW] = useState(1400);

  /* Fenetre de redaction : null = fermee. `repond` porte le Message-ID
     auquel on repond, pour que le fil reste correct chez le destinataire. */
  const [redac, setRedac] = useState<null | { to: string; cc: string; subject: string; corps: string; repond?: string }>(null);
  const [envoi, setEnvoi] = useState(false);

  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3500); };
  const etroit = w < 1320;
  const mobile = w < 1000;

  useEffect(() => {
    const r = () => setW(window.innerWidth);
    r(); window.addEventListener('resize', r);
    return () => window.removeEventListener('resize', r);
  }, []);

  async function charger() {
    setChargement(true);
    try {
      const p = new URLSearchParams({ vue, filtre, ...(q ? { q } : {}) });
      const d = await adminFetch(`/api/inbox?${p}`).then(r => r.json());
      setMessages(d.messages || []);
      setCompteurs(d.compteurs || {});
      setEtat(d.etat || []);
    } catch { say('Chargement impossible'); }
    finally { setChargement(false); }
  }
  useEffect(() => { charger(); /* eslint-disable-next-line */ }, [vue, filtre]);

  async function relever() {
    setSynchro(true);
    try {
      const d = await adminFetch('/api/inbox/sync', { method: 'POST' }).then(r => r.json());
      const n = (d.resultats || []).reduce((s: number, r: any) => s + (r.nouveaux || 0), 0);
      const err = (d.resultats || []).find((r: any) => r.erreur);
      say(err ? `Erreur : ${err.erreur}` : `Boîte synchronisée · ${n} message(s)`);
      await charger();
    } catch (e: any) { say(e.message); }
    finally { setSynchro(false); }
  }

  async function ouvrir(m: Msg) {
    setOuvert(m);
    try {
      const d = await adminFetch('/api/inbox', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: m.id }),
      }).then(r => r.json());
      if (d.message) {
        setOuvert(d.message);
        setMessages(ms => ms.map(x => (x.id === m.id ? { ...x, seen: true } : x)));
        setCompteurs((c: any) => ({ ...c, nonLus: Math.max(0, c.nonLus - (m.seen ? 0 : 1)) }));
      }
    } catch { say('Message illisible'); }
  }

  async function agir(action: string, ids?: string[]) {
    const liste = ids || Array.from(sel);
    if (!liste.length) return;
    // Optimiste : le cache local reflète le geste tout de suite, IMAP suit.
    setMessages(ms => ms.map(m => {
      if (!liste.includes(m.id)) return m;
      if (action === 'lu') return { ...m, seen: true };
      if (action === 'non-lu') return { ...m, seen: false };
      if (action === 'etoile') return { ...m, flagged: !m.flagged };
      return m;
    }));
    if (action === 'corbeille') setMessages(ms => ms.filter(m => !liste.includes(m.id)));
    setSel(new Set());
    try {
      await adminFetch('/api/inbox', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: liste, action }),
      });
    } catch { say('Action non enregistrée'); charger(); }
  }

  function nouveau() { setRedac({ to: '', cc: '', subject: '', corps: '' }); }

  function repondre(m: Msg, tous = false) {
    const cc = tous ? (m.to_emails || []).filter(e => e && e !== 'hej@swedishcravings.fr').join(', ') : '';
    setRedac({
      to: m.from_email || '', cc,
      subject: /^re\s*:/i.test(m.subject || '') ? (m.subject || '') : `Re : ${m.subject || ''}`,
      corps: '', repond: (m as any).message_id || undefined,
    });
  }

  function transferer(m: Msg) {
    setRedac({
      to: '', cc: '',
      subject: /^tr\s*:/i.test(m.subject || '') ? (m.subject || '') : `Tr : ${m.subject || ''}`,
      corps: `<br /><br />---------- Message transféré ----------<br />De : ${m.from_email}<br />Objet : ${m.subject}<br /><br />${m.body_html || m.body_text || ''}`,
    });
  }

  async function envoyer() {
    if (!redac) return;
    setEnvoi(true);
    try {
      const res = await adminFetch('/api/inbox/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: redac.to, cc: redac.cc, subject: redac.subject,
          // Le champ est un textarea : les retours à la ligne deviennent des <br />.
          html: redac.corps.split('\n').join('<br />'),
          inReplyTo: redac.repond,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Envoi impossible');
      say('Message envoyé');
      setRedac(null);
    } catch (e: any) { say(e.message); }
    finally { setEnvoi(false); }
  }

  const nonLusListe = useMemo(() => messages.filter(m => !m.seen).length, [messages]);
  const inbox = etat.find(e => e.folder === 'INBOX');

  /* ── Colonne dossiers ─────────────────────────────────── */
  const dossiers = (
    <div style={{ width: 228, flexShrink: 0, background: C.sidebar, borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: 12, borderBottom: `1px solid ${C.ligneFaible}` }}>
        <button className="sc-btn" style={{ width: '100%', height: 38, justifyContent: 'center', background: C.ink, color: '#fff', border: 'none' }}
                onClick={nouveau}>
          <span className="ms">edit</span>Nouveau message
        </button>
        <button className="sc-btn sc-btn-secondary" onClick={relever} disabled={synchro}
                style={{ width: '100%', height: 30, marginTop: 8, justifyContent: 'center', fontSize: 11.5 }}>
          <span className="ms" style={{ animation: synchro ? 'sc-spin .9s linear infinite' : 'none' }}>sync</span>
          {synchro ? 'Synchronisation…' : `Envoyer / recevoir · ${depuis(inbox?.last_sync_at)}`}
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingTop: 8 }}>
        {VUES.map(v => {
          const actif = vue === v.id;
          const n = compteurs[v.compteur] || 0;
          return (
            <button key={v.id} onClick={() => { setVue(v.id); setOuvert(null); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, width: 'calc(100% - 16px)', margin: '0 8px 2px',
                      padding: '7px 13px 7px 13px', borderRadius: 7, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                      background: actif ? C.accentFond : 'transparent',
                      color: actif ? C.accent : C.t2, fontWeight: actif ? 600 : 400, fontSize: 12.5,
                    }}>
              <span className="ms" style={{ fontSize: 19, fontVariationSettings: actif ? "'wght' 400" : "'wght' 300" }}>{v.icone}</span>
              <span style={{ flex: 1, textAlign: 'left' }}>{v.label}</span>
              {n > 0 && (
                <span className="sc-num" style={{
                  minWidth: 19, height: 17, borderRadius: 9, display: 'inline-flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: 10, fontWeight: 700, padding: '0 5px',
                  background: actif ? C.accent : '#EFEBE4', color: actif ? '#fff' : '#857C71',
                }}>{n}</span>
              )}
            </button>
          );
        })}
      </div>

      <div style={{ padding: '10px 13px', borderTop: `1px solid ${C.ligneFaible}`, fontSize: 10.5, color: C.t4 }}>
        <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: 3, background: inbox?.last_error ? '#B03A2E' : '#3E7A4E', marginRight: 6 }} />
        {inbox?.last_error ? 'IMAP en erreur' : 'IMAP connecté'} · hej@swedishcravings.fr
      </div>
    </div>
  );

  /* ── Colonne liste ────────────────────────────────────── */
  const liste = (
    <div style={{ width: mobile ? '100%' : (etroit ? 340 : 392), flexShrink: 0, background: C.sidebar, borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flexShrink: 0, background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '11px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: C.t1 }}>
              {VUES.find(v => v.id === vue)?.label || vue}
            </div>
            <div style={{ fontSize: 11, color: C.t4 }}>
              {messages.length} message{messages.length > 1 ? 's' : ''}
              {nonLusListe > 0 ? ` · ${nonLusListe} non lu${nonLusListe > 1 ? 's' : ''}` : ' · tout est lu'}
            </div>
          </div>
        </div>

        <div style={{ position: 'relative', marginTop: 9 }}>
          <span className="ms" style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: C.t5 }}>search</span>
          <input className="sc-input" value={q} onChange={e => setQ(e.target.value)}
                 onKeyDown={e => e.key === 'Enter' && charger()}
                 placeholder="Rechercher" style={{ width: '100%', height: 30, paddingLeft: 30, fontSize: 12 }} />
        </div>

        <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
          {[['tous', 'Tous'], ['non-lus', `Non lus${compteurs.nonLus ? ` ${compteurs.nonLus}` : ''}`], ['pieces-jointes', 'Avec pièce jointe']].map(([id, lab]) => (
            <button key={id} onClick={() => setFiltre(id)}
                    style={{
                      border: 'none', cursor: 'pointer', fontFamily: 'inherit', borderRadius: 6,
                      padding: '4px 9px', fontSize: 11.5,
                      background: filtre === id ? C.ink : 'transparent',
                      color: filtre === id ? '#fff' : C.t3, fontWeight: filtre === id ? 600 : 400,
                    }}>{lab}</button>
          ))}
        </div>

        {sel.size > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 8, background: C.selFond, border: `1px solid ${C.selBord}`, borderRadius: 7, padding: '6px 9px' }}>
            <span style={{ flex: 1, fontSize: 11.5, color: C.selTexte, fontWeight: 600 }}>{sel.size} sélectionné{sel.size > 1 ? 's' : ''}</span>
            <button className="sc-iconbtn" title="Marquer lu" onClick={() => agir('lu')}><span className="ms">mark_email_read</span></button>
            <button className="sc-iconbtn" title="Marquer non lu" onClick={() => agir('non-lu')}><span className="ms">mark_email_unread</span></button>
            <button className="sc-iconbtn" title="Corbeille" onClick={() => agir('corbeille')}><span className="ms" style={{ color: '#B03A2E' }}>delete</span></button>
            <button className="sc-iconbtn" title="Annuler" onClick={() => setSel(new Set())}><span className="ms">close</span></button>
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {chargement ? (
          <div style={{ padding: 40, textAlign: 'center', fontSize: 12.5, color: C.t4 }}>Chargement…</div>
        ) : messages.length === 0 ? (
          <div style={{ padding: '54px 20px', textAlign: 'center', color: C.t4 }}>
            <span className="ms" style={{ fontSize: 34, color: C.t6, display: 'block', marginBottom: 8 }}>inbox</span>
            <div style={{ fontSize: 12.5 }}>Aucun message</div>
          </div>
        ) : messages.map(m => {
          const actif = ouvert?.id === m.id;
          const coche = sel.has(m.id);
          return (
            <div key={m.id} onClick={() => ouvrir(m)}
                 style={{
                   display: 'flex', gap: 11, padding: '11px 14px', cursor: 'pointer',
                   borderBottom: `1px solid ${C.ligne}`,
                   borderLeft: `3px solid ${actif ? C.accent : (!m.seen ? C.accentBord : 'transparent')}`,
                   background: actif || !m.seen ? C.surface : 'transparent',
                 }}>
              <div onClick={e => { e.stopPropagation(); setSel(s => { const n = new Set(s); n.has(m.id) ? n.delete(m.id) : n.add(m.id); return n; }); }}
                   style={{
                     width: 30, height: 30, borderRadius: 15, flexShrink: 0, display: 'flex', alignItems: 'center',
                     justifyContent: 'center', fontSize: 11, fontWeight: 600,
                     background: coche ? C.accent : `${couleurDe(m.label)}1A`,
                     color: coche ? '#fff' : couleurDe(m.label),
                   }}>
                {coche ? <span className="ms" style={{ fontSize: 17 }}>check</span> : initiales(m.from_name || m.from_email)}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: m.seen ? 500 : 700, color: C.t1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.from_name || m.from_email}
                  </span>
                  <span className="sc-num" style={{ fontSize: 10.5, color: C.t5, flexShrink: 0 }}>{quand(m.sent_at)}</span>
                </div>
                <div style={{ fontSize: 12.5, fontWeight: m.seen ? 400 : 600, color: C.t2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
                  {m.subject}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: C.t5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.preview}
                  </span>
                  {!!m.attachments?.length && <span className="ms" style={{ fontSize: 15, color: C.t5 }}>attach_file</span>}
                  <button onClick={e => { e.stopPropagation(); agir('etoile', [m.id]); }}
                          style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }}>
                    <span className="ms" style={{ fontSize: 16, color: m.flagged ? C.etoile : C.t6, fontVariationSettings: m.flagged ? "'FILL' 1" : "'FILL' 0" }}>star</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  /* ── Colonne lecture ──────────────────────────────────── */
  const lecture = (
    <div style={{ flex: 1, minWidth: 0, background: C.lecture, height: '100%', overflowY: 'auto' }}>
      {!ouvert ? (
        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: C.t4 }}>
          <span className="ms" style={{ fontSize: 44, color: C.t6 }}>drafts</span>
          <div style={{ fontSize: 13, marginTop: 10 }}>Sélectionne un message</div>
        </div>
      ) : (
        <div style={{ padding: mobile ? 16 : 26 }}>
          {mobile && (
            <button className="sc-btn sc-btn-secondary" style={{ marginBottom: 12 }} onClick={() => setOuvert(null)}>
              <span className="ms">arrow_back</span>Retour
            </button>
          )}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ padding: '18px 22px', borderBottom: `1px solid ${C.ligne}` }}>
              <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 26, fontWeight: 600, color: C.t1, lineHeight: 1.2 }}>
                {ouvert.subject}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 13 }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 17, flexShrink: 0, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: 12, fontWeight: 600,
                  background: `${couleurDe(ouvert.label)}1A`, color: couleurDe(ouvert.label),
                }}>{initiales(ouvert.from_name || ouvert.from_email)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.t1 }}>{ouvert.from_name || ouvert.from_email}</div>
                  <div style={{ fontSize: 11.5, color: C.t4 }}>{ouvert.from_email}</div>
                </div>
                <span className="sc-num" style={{ fontSize: 11.5, color: C.t4 }}>
                  {ouvert.sent_at && new Date(ouvert.sent_at).toLocaleString('fr-FR', { day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' })}
                </span>
                <button className="sc-btn sc-btn-secondary" style={{ padding: '5px 10px', fontSize: 11.5 }} onClick={() => repondre(ouvert)}>
                  <span className="ms">reply</span>Répondre
                </button>
                <button className="sc-iconbtn" title="Répondre à tous" onClick={() => repondre(ouvert, true)}>
                  <span className="ms">reply_all</span>
                </button>
                <button className="sc-iconbtn" title="Transférer" onClick={() => transferer(ouvert)}>
                  <span className="ms">forward</span>
                </button>
                <button className="sc-iconbtn" title="Suivre" onClick={() => agir('etoile', [ouvert.id])}>
                  <span className="ms" style={{ color: ouvert.flagged ? C.etoile : C.t6, fontVariationSettings: ouvert.flagged ? "'FILL' 1" : "'FILL' 0" }}>star</span>
                </button>
                <button className="sc-iconbtn" title="Supprimer" onClick={() => { agir('corbeille', [ouvert.id]); setOuvert(null); }}>
                  <span className="ms" style={{ color: '#B03A2E' }}>delete</span>
                </button>
              </div>
            </div>

            {/* Le HTML d'un email est isolé : il ne doit pas déteindre sur le back-office. */}
            {ouvert.body_html ? (
              <iframe srcDoc={ouvert.body_html} title="Message" sandbox=""
                      style={{ width: '100%', height: 620, border: 'none', background: '#fff' }} />
            ) : (
              <div style={{ padding: '20px 22px', fontSize: 14, lineHeight: 1.72, color: C.corps, whiteSpace: 'pre-wrap' }}>
                {ouvert.body_text || '(message vide)'}
              </div>
            )}

            {!!ouvert.attachments?.length && (
              <div style={{ padding: '13px 22px', borderTop: `1px solid ${C.ligne}`, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {ouvert.attachments.map((a: any, i: number) => (
                  <span key={i} className="sc-chip" style={{ fontSize: 11 }}>
                    <span className="ms" style={{ fontSize: 14 }}>attach_file</span>{a.filename}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: '@keyframes sc-spin { to { transform: rotate(360deg) } }' }} />
      <div style={{ display: 'flex', height: 'calc(100vh - 90px)', margin: '-16px -18px', overflow: 'hidden', border: `1px solid ${C.border}` }}>
        {!mobile && dossiers}
        {(!mobile || !ouvert) && liste}
        {(!mobile || ouvert) && lecture}
      </div>

      {/* Fenetre de redaction — 660 x 640, en surimpression */}
      {redac && (
        <div style={{
          position: 'fixed', right: 24, bottom: 24, width: mobile ? 'calc(100vw - 32px)' : 660,
          height: mobile ? '80vh' : 640, background: C.surface, border: `1px solid ${C.border}`,
          borderRadius: 10, boxShadow: '0 20px 60px rgba(0,0,0,.22)', zIndex: 250,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 15px', background: C.ink, color: '#fff' }}>
            <span className="ms" style={{ fontSize: 18 }}>edit</span>
            <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600 }}>
              {redac.repond ? 'Répondre' : 'Nouveau message'}
            </span>
            <button onClick={() => setRedac(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#fff', lineHeight: 1 }}>
              <span className="ms">close</span>
            </button>
          </div>

          <div style={{ padding: '0 15px' }}>
            {[['to', 'À'], ['cc', 'Cc'], ['subject', 'Objet']].map(([k, lab]) => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, borderBottom: `1px solid ${C.ligne}`, padding: '9px 0' }}>
                <span style={{ width: 44, fontSize: 11.5, color: C.t4, flexShrink: 0 }}>{lab}</span>
                <input value={(redac as any)[k]} onChange={e => setRedac({ ...redac, [k]: e.target.value })}
                       style={{ flex: 1, border: 'none', outline: 'none', fontSize: 13, color: C.t1, fontFamily: 'inherit' }} />
              </div>
            ))}
          </div>

          <textarea value={redac.corps} onChange={e => setRedac({ ...redac, corps: e.target.value })}
                    placeholder="Écris ton message…"
                    style={{
                      flex: 1, border: 'none', outline: 'none', resize: 'none', padding: '14px 15px',
                      fontSize: 14, lineHeight: 1.72, color: C.corps, fontFamily: 'inherit',
                    }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 15px', background: '#FBF9F6', borderTop: `1px solid ${C.border}` }}>
            <button className="sc-btn" onClick={envoyer} disabled={envoi}
                    style={{ background: C.vert, color: '#fff', border: 'none' }}>
              <span className="ms">send</span>{envoi ? 'Envoi…' : 'Envoyer'}
            </button>
            <span style={{ flex: 1, fontSize: 11, color: C.t4 }}>
              La signature Swedish Cravings est ajoutée automatiquement.
            </span>
            <button className="sc-iconbtn" title="Abandonner" onClick={() => setRedac(null)}>
              <span className="ms" style={{ color: '#B03A2E' }}>delete</span>
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, background: C.ink, color: '#fff',
          padding: '10px 18px', borderRadius: 7, fontSize: 12.5, zIndex: 300,
        }}>{toast}</div>
      )}
    </>
  );
}
