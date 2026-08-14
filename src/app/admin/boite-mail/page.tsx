'use client';
import { useCallback, useEffect, useState } from 'react';
import { adminFetch, downloadAuth } from '@/lib/auth-client';
import Redaction, { Brouillon } from './Redaction';
import {
  C, COULEUR_ETIQ, couleurDe, initiales, quand, depuis,
  Msg, ItemNav, GroupeNav, LigneMessage, Vide,
} from './ui';

/* ═══════════════════════════════════════════════════════════════
   BOÎTE MAIL — hej@swedishcravings.fr

   Trois panneaux : dossiers 228 px · liste 392 px (340 sous 1320 px)
   · lecture. Les seuils sont calculés en JS comme le demande le
   handoff, mais **alignés sur ceux du shell** : bascule mobile à
   900 px, et la hauteur réserve la topbar (48 px) plus la barre
   d'onglets (58 px) quand elle est là. Les deux désaccordés faisaient
   déborder l'écran sur téléphone.

   La liste est paginée : recharger un dossier entier à chaque
   changement de filtre ne tenait que tant que la boîte était petite.
   ═══════════════════════════════════════════════════════════════ */

const VUES = [
  { id: 'INBOX', icone: 'inbox', label: 'Réception', compteur: 'nonLus' },
  { id: 'unread', icone: 'mark_email_unread', label: 'Non lus', compteur: 'nonLus' },
  { id: 'starred', icone: 'star', label: 'Suivis', compteur: 'suivis' },
  { id: 'drafts', icone: 'drafts', label: 'Brouillons', compteur: 'brouillons' },
  { id: 'scheduled', icone: 'schedule_send', label: 'Programmés', compteur: 'programmes' },
];

const TAILLE = 50;

export default function BoiteMailPage() {
  const [vue, setVue] = useState('INBOX');
  const [filtre, setFiltre] = useState('tous');
  const [etiquette, setEtiquette] = useState('');
  const [q, setQ] = useState('');
  const [recherche, setRecherche] = useState('');

  const [messages, setMessages] = useState<Msg[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [compteurs, setCompteurs] = useState<any>({ nonLus: 0, suivis: 0, brouillons: 0, programmes: 0 });
  const [etat, setEtat] = useState<any[]>([]);
  const [dossiers, setDossiers] = useState<any[]>([]);
  const [brouillons, setBrouillons] = useState<any[]>([]);
  const [programmes, setProgrammes] = useState<any[]>([]);

  const [ouvert, setOuvert] = useState<Msg | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [redac, setRedac] = useState<Brouillon | null>(null);

  const [carnet, setCarnet] = useState<any[]>([]);
  const [modeles, setModeles] = useState<any[]>([]);
  const [chargement, setChargement] = useState(true);
  const [synchro, setSynchro] = useState(false);
  const [toast, setToast] = useState('');
  const [w, setW] = useState(1400);

  /* Sur mobile la colonne des dossiers devient un tiroir : sans lui, le
     bouton « Nouveau message », les brouillons, les programmes et les
     etiquettes etaient tout simplement inaccessibles au telephone. */
  const [tiroir, setTiroir] = useState(false);

  const say = useCallback((m: string) => { setToast(m); setTimeout(() => setToast(''), 3500); }, []);
  const mobile = w < 900;                 // même seuil que le shell
  const etroit = w < 1320;
  const virtuelle = vue === 'drafts' || vue === 'scheduled';

  useEffect(() => {
    const r = () => setW(window.innerWidth);
    r(); window.addEventListener('resize', r);
    return () => window.removeEventListener('resize', r);
  }, []);

  const charger = useCallback(async (p = 0, ajouter = false) => {
    setChargement(true);
    try {
      if (vue === 'drafts') {
        const d = await adminFetch('/api/inbox/drafts').then(r => r.json());
        setBrouillons(d.brouillons || []);
      } else if (vue === 'scheduled') {
        const d = await adminFetch('/api/inbox/scheduled').then(r => r.json());
        setProgrammes(d.programmes || []);
      } else {
        const params = new URLSearchParams({
          vue, filtre, page: String(p), taille: String(TAILLE),
          ...(recherche ? { q: recherche } : {}), ...(etiquette ? { etiquette } : {}),
        });
        const d = await adminFetch(`/api/inbox?${params}`).then(r => r.json());
        setMessages(ms => (ajouter ? [...ms, ...(d.messages || [])] : (d.messages || [])));
        setTotal(d.total || 0);
        setPage(d.page || 0);
        setCompteurs(d.compteurs || {});
        setEtat(d.etat || []);
      }
    } catch { say('Chargement impossible'); }
    finally { setChargement(false); }
  }, [vue, filtre, recherche, etiquette, say]);

  useEffect(() => { setSel(new Set()); charger(0); }, [charger]);

  useEffect(() => {
    adminFetch('/api/inbox/contacts').then(r => r.json()).then(d => setCarnet(d.carnet || [])).catch(() => {});
    adminFetch('/api/email-templates').then(r => r.json()).then(d => setModeles(d.templates || [])).catch(() => {});
    adminFetch('/api/inbox/folders').then(r => r.json()).then(d => setDossiers(d.dossiers || [])).catch(() => {});
  }, []);

  async function relever() {
    setSynchro(true);
    try {
      const d = await adminFetch('/api/inbox/sync', { method: 'POST' }).then(r => r.json());
      const n = (d.resultats || []).reduce((s: number, r: any) => s + (r.nouveaux || 0), 0);
      const err = (d.resultats || []).find((r: any) => r.erreur);
      const prog = d.programmes?.envoyes ? ` · ${d.programmes.envoyes} envoi(s) programmé(s) parti(s)` : '';
      // Nommer le dossier : « Command failed » seul n'aide personne.
      say(err ? `Dossier « ${err.folder} » : ${err.erreur}` : `Boîte synchronisée · ${n} message(s)${prog}`);
      charger(0);
    } catch (e: any) { say(e.message); }
    finally { setSynchro(false); }
  }

  async function ouvrirDossier(d: any) {
    setVue(d.path); setOuvert(null);
    if (d.enCache === 0) {
      setChargement(true);
      try {
        await adminFetch('/api/inbox/folders', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folder: d.path }),
        });
        setDossiers(ds => ds.map(x => (x.path === d.path ? { ...x, enCache: 1 } : x)));
      } catch { say('Dossier illisible'); }
      charger(0);
    }
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
        if (!m.seen) setCompteurs((c: any) => ({ ...c, nonLus: Math.max(0, c.nonLus - 1) }));
      }
    } catch { say('Message illisible'); }
  }

  async function agir(action: string, ids?: string[], label?: string) {
    const liste = ids || Array.from(sel);
    if (!liste.length) return;
    // Optimiste : le geste se voit tout de suite, IMAP suit derrière.
    setMessages(ms => ms.map(m => {
      if (!liste.includes(m.id)) return m;
      if (action === 'lu') return { ...m, seen: true };
      if (action === 'non-lu') return { ...m, seen: false };
      if (action === 'etoile') return { ...m, flagged: !m.flagged };
      if (action === 'etiquette') return { ...m, label: label || null };
      return m;
    }));
    if (action === 'corbeille') {
      setMessages(ms => ms.filter(m => !liste.includes(m.id)));
      if (ouvert && liste.includes(ouvert.id)) setOuvert(null);
    }
    setSel(new Set());
    try {
      await adminFetch('/api/inbox', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: liste, action, label }),
      });
    } catch { say('Action non enregistrée'); charger(0); }
  }

  async function annulerProgramme(id: string) {
    try {
      const res = await adminFetch(`/api/inbox/scheduled?id=${id}`, { method: 'DELETE' });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      say('Envoi annulé');
      charger(0);
    } catch (e: any) { say(e.message); }
  }

  async function supprimerBrouillon(id: string) {
    await adminFetch(`/api/inbox/drafts?id=${id}`, { method: 'DELETE' });
    setBrouillons(b => b.filter(x => x.id !== id));
    say('Brouillon supprimé');
  }

  function repondre(m: Msg, tous = false) {
    const cc = tous ? (m.to_emails || []).filter(e => e && e !== 'hej@swedishcravings.fr').join(', ') : '';
    const re = /^re\s*:/i.test(m.subject || '');
    setRedac({
      to: m.from_email || '', cc, subject: re ? (m.subject || '') : `Re : ${m.subject || ''}`,
      corps: '', repond: m.message_id || undefined,
    });
  }

  function transferer(m: Msg) {
    const tr = /^tr\s*:/i.test(m.subject || '');
    setRedac({
      to: '', cc: '', subject: tr ? (m.subject || '') : `Tr : ${m.subject || ''}`,
      corps: `\n\n---------- Message transféré ----------\nDe : ${m.from_email}\nObjet : ${m.subject}\n\n${m.body_text || ''}`,
    });
  }

  const inbox = etat.find(e => e.folder === 'INBOX');
  /* Hauteur disponible : la page vit dans .sc-main, sous une topbar de
     48 px, avec 16 px de padding haut, et la barre d'onglets en bas
     sur mobile. La marge négative annule le padding de .sc-screen. */
  const hauteur = `calc(100vh - ${48 + 16 + (mobile ? 58 : 0)}px)`;

  /* ── Colonne 1 : dossiers ─────────────────────────────── */
  const colDossiers = (
    <div style={{ width: 228, flexShrink: 0, background: C.sidebar, borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: 12, borderBottom: `1px solid ${C.ligneFaible}` }}>
        <button className="sc-btn" style={{ width: '100%', height: 38, justifyContent: 'center', background: C.ink, color: '#fff', border: 'none' }}
                onClick={() => { setRedac({ to: '', cc: '', subject: '', corps: '' }); setTiroir(false); }}>
          <span className="ms">edit</span>Nouveau message
        </button>
        <button className="sc-btn sc-btn-secondary" onClick={relever} disabled={synchro}
                style={{ width: '100%', height: 30, marginTop: 8, justifyContent: 'center', fontSize: 11.5 }}>
          <span className="ms" style={{ animation: synchro ? 'sc-spin .9s linear infinite' : 'none' }}>sync</span>
          {synchro ? 'Synchronisation…' : `Envoyer / recevoir · ${depuis(inbox?.last_sync_at)}`}
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingTop: 8 }}>
        {VUES.map(v => (
          <ItemNav key={v.id} icone={v.icone} label={v.label} actif={vue === v.id} pastille
                   compteur={compteurs[v.compteur] || 0}
                   onClick={() => { setVue(v.id); setOuvert(null); setTiroir(false); }} />
        ))}

        {dossiers.filter(d => d.role !== 'inbox').length > 0 && (
          <GroupeNav titre="Dossiers">
            {dossiers.filter(d => d.role !== 'inbox').map(d => (
              <ItemNav key={d.path}
                       icone={d.role === 'sent' ? 'send' : d.role === 'drafts' ? 'drafts'
                         : d.role === 'trash' ? 'delete' : d.role === 'junk' ? 'report'
                         : d.role === 'archive' ? 'archive' : 'folder'}
                       label={d.nom} actif={vue === d.path} compteur={d.enCache}
                       onClick={() => { ouvrirDossier(d); setTiroir(false); }} />
            ))}
          </GroupeNav>
        )}

        <GroupeNav titre="Étiquettes">
          {Object.keys(COULEUR_ETIQ).map(l => (
            <ItemNav key={l} icone="label" carre={COULEUR_ETIQ[l]} label={l}
                     actif={etiquette === l}
                     onClick={() => { setEtiquette(etiquette === l ? '' : l); setOuvert(null); setTiroir(false); }} />
          ))}
        </GroupeNav>
      </div>

      <div style={{ padding: '10px 13px', borderTop: `1px solid ${C.ligneFaible}`, fontSize: 10.5, color: C.t4 }}>
        <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: 3, background: inbox?.last_error ? C.rouge : '#3E7A4E', marginRight: 6 }} />
        {inbox?.last_error ? 'IMAP en erreur' : 'IMAP connecté'} · hej@swedishcravings.fr
      </div>
    </div>
  );

  /* ── Colonne 2 : liste ────────────────────────────────── */
  const colListe = (
    <div style={{ width: mobile ? '100%' : (etroit ? 340 : 392), flexShrink: 0, background: C.sidebar, borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flexShrink: 0, background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '11px 14px' }}>
        {mobile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
            <button className="sc-iconbtn" aria-label="Dossiers" onClick={() => setTiroir(true)}>
              <span className="ms">menu</span>
            </button>
            <button className="sc-btn sc-btn-secondary" style={{ padding: '5px 10px', fontSize: 11.5 }}
                    onClick={relever} disabled={synchro}>
              <span className="ms" style={{ animation: synchro ? 'sc-spin .9s linear infinite' : 'none' }}>sync</span>
              {synchro ? '…' : 'Relever'}
            </button>
            <span style={{ flex: 1 }} />
            <button className="sc-btn" style={{ background: C.ink, color: '#fff', border: 'none', padding: '6px 12px', fontSize: 11.5 }}
                    onClick={() => setRedac({ to: '', cc: '', subject: '', corps: '' })}>
              <span className="ms">edit</span>Écrire
            </button>
          </div>
        )}
        <div style={{ fontSize: 15, fontWeight: 600, color: C.t1 }}>
          {VUES.find(v => v.id === vue)?.label || dossiers.find(d => d.path === vue)?.nom || vue}
          {etiquette && <span style={{ fontSize: 11.5, fontWeight: 400, color: couleurDe(etiquette) }}> · {etiquette}</span>}
        </div>
        <div style={{ fontSize: 11, color: C.t4 }}>
          {virtuelle
            ? `${(vue === 'drafts' ? brouillons : programmes).length} élément(s)`
            : `${total} message${total > 1 ? 's' : ''}${messages.length < total ? ` · ${messages.length} affichés` : ''}`}
        </div>

        {!virtuelle && (
          <>
            <div style={{ position: 'relative', marginTop: 9 }}>
              <span className="ms" style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: C.t5 }}>search</span>
              <input className="sc-input" value={q} onChange={e => setQ(e.target.value)}
                     onKeyDown={e => e.key === 'Enter' && setRecherche(q)}
                     placeholder="Rechercher puis Entrée" style={{ width: '100%', height: 30, paddingLeft: 30, fontSize: 12 }} />
            </div>

            <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
              {[['tous', 'Tous'], ['non-lus', 'Non lus'], ['pieces-jointes', 'Pièce jointe']].map(([id, lab]) => (
                <button key={id} onClick={() => setFiltre(id)}
                        style={{
                          border: 'none', cursor: 'pointer', fontFamily: 'inherit', borderRadius: 6,
                          padding: '4px 9px', fontSize: 11.5,
                          background: filtre === id ? C.ink : 'transparent',
                          color: filtre === id ? '#fff' : C.t3, fontWeight: filtre === id ? 600 : 400,
                        }}>{lab}</button>
              ))}
            </div>
          </>
        )}

        {sel.size > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 8, background: C.selFond, border: `1px solid ${C.selBord}`, borderRadius: 7, padding: '6px 9px' }}>
            <span style={{ flex: 1, fontSize: 11.5, color: C.selTexte, fontWeight: 600 }}>{sel.size} sélectionné{sel.size > 1 ? 's' : ''}</span>
            <button className="sc-iconbtn" title="Marquer lu" onClick={() => agir('lu')}><span className="ms">mark_email_read</span></button>
            <button className="sc-iconbtn" title="Marquer non lu" onClick={() => agir('non-lu')}><span className="ms">mark_email_unread</span></button>
            <button className="sc-iconbtn" title="Corbeille" onClick={() => agir('corbeille')}><span className="ms" style={{ color: C.rouge }}>delete</span></button>
            <button className="sc-iconbtn" title="Annuler" onClick={() => setSel(new Set())}><span className="ms">close</span></button>
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {vue === 'drafts' ? (
          brouillons.length === 0 ? <Vide icone="drafts" texte="Aucun brouillon" /> :
            brouillons.map(b => (
              <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderBottom: `1px solid ${C.ligne}`, cursor: 'pointer' }}
                   onClick={() => setRedac({
                     id: b.id, to: b.to_emails || '', cc: b.cc_emails || '', subject: b.subject || '',
                     corps: (b.body || '').split('<br />').join('\n'), repond: b.in_reply_to || undefined,
                   })}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.t1 }}>{b.subject || '(sans objet)'}</div>
                  <div style={{ fontSize: 11.5, color: C.t5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {b.to_emails || 'sans destinataire'} · modifié {depuis(b.updated_at)}
                  </div>
                </div>
                <button className="sc-iconbtn" onClick={e => { e.stopPropagation(); supprimerBrouillon(b.id); }}>
                  <span className="ms" style={{ color: C.rouge }}>delete</span>
                </button>
              </div>
            ))
        ) : vue === 'scheduled' ? (
          programmes.length === 0 ? <Vide icone="schedule_send" texte="Aucun envoi programmé" /> :
            programmes.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderBottom: `1px solid ${C.ligne}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.t1 }}>{s.subject}</div>
                  <div style={{ fontSize: 11.5, color: C.t5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.to_emails} · {new Date(s.send_at).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </div>
                  {s.last_error && <div style={{ fontSize: 10.5, color: C.rouge }}>{s.last_error}</div>}
                </div>
                <span className="sc-badge" style={{
                  background: s.status === 'sent' ? '#E9F0E6' : s.status === 'failed' ? '#FBE7E4' : s.status === 'cancelled' ? '#F1EDE7' : '#FBF0DA',
                  color: s.status === 'sent' ? '#3E5238' : s.status === 'failed' ? '#B03A2E' : s.status === 'cancelled' ? '#857C71' : '#8A5B08',
                }}>
                  {s.status === 'sent' ? 'Envoyé' : s.status === 'failed' ? 'Échec'
                    : s.status === 'cancelled' ? 'Annulé' : s.status === 'sending' ? 'En cours' : 'En attente'}
                </span>
                {s.status === 'pending' && (
                  <button className="sc-iconbtn" title="Annuler" onClick={() => annulerProgramme(s.id)}>
                    <span className="ms" style={{ color: C.rouge }}>cancel</span>
                  </button>
                )}
              </div>
            ))
        ) : chargement && messages.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', fontSize: 12.5, color: C.t4 }}>Chargement…</div>
        ) : messages.length === 0 ? (
          <Vide icone="inbox" texte="Aucun message" />
        ) : (
          <>
            {messages.map(m => (
              <LigneMessage key={m.id} m={m} actif={ouvert?.id === m.id} coche={sel.has(m.id)}
                            onOuvrir={() => ouvrir(m)}
                            onCocher={() => setSel(s => {
                              const n = new Set(s);
                              if (n.has(m.id)) n.delete(m.id); else n.add(m.id);
                              return n;
                            })}
                            onEtoile={() => agir('etoile', [m.id])} />
            ))}
            {messages.length < total && (
              <button className="sc-btn sc-btn-secondary" onClick={() => charger(page + 1, true)} disabled={chargement}
                      style={{ width: 'calc(100% - 28px)', margin: '12px 14px', justifyContent: 'center' }}>
                {chargement ? 'Chargement…' : `Charger ${Math.min(TAILLE, total - messages.length)} de plus`}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );

  /* ── Colonne 3 : lecture ──────────────────────────────── */
  const colLecture = (
    <div style={{ flex: 1, minWidth: 0, background: C.lecture, height: '100%', overflowY: 'auto' }}>
      {!ouvert ? (
        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: C.t4 }}>
          <span className="ms" style={{ fontSize: 44, color: C.t6 }}>mail</span>
          <div style={{ fontSize: 13, marginTop: 10 }}>Sélectionne un message</div>
        </div>
      ) : (
        <div style={{ padding: mobile ? 14 : 26 }}>
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 13, flexWrap: 'wrap' }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 17, flexShrink: 0, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: 12, fontWeight: 600,
                  background: `${couleurDe(ouvert.label)}1A`, color: couleurDe(ouvert.label),
                }}>{initiales(ouvert.from_name || ouvert.from_email)}</div>
                <div style={{ flex: 1, minWidth: 120 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.t1 }}>{ouvert.from_name || ouvert.from_email}</div>
                  <div style={{ fontSize: 11.5, color: C.t4 }}>{ouvert.from_email} · {quand(ouvert.sent_at)}</div>
                </div>

                <select value={ouvert.label || ''} className="sc-input" style={{ height: 28, fontSize: 11, maxWidth: 130 }}
                        onChange={e => { const l = e.target.value; setOuvert({ ...ouvert, label: l || null }); agir('etiquette', [ouvert.id], l); }}>
                  <option value="">Sans étiquette</option>
                  {Object.keys(COULEUR_ETIQ).map(l => <option key={l} value={l}>{l}</option>)}
                </select>
                <button className="sc-btn sc-btn-secondary" style={{ padding: '5px 10px', fontSize: 11.5 }} onClick={() => repondre(ouvert)}>
                  <span className="ms">reply</span>Répondre
                </button>
                <button className="sc-iconbtn" title="Répondre à tous" onClick={() => repondre(ouvert, true)}><span className="ms">reply_all</span></button>
                <button className="sc-iconbtn" title="Transférer" onClick={() => transferer(ouvert)}><span className="ms">forward</span></button>
                <button className="sc-iconbtn" title="Suivre" onClick={() => agir('etoile', [ouvert.id])}>
                  <span className="ms" style={{ color: ouvert.flagged ? C.etoile : C.t6, fontVariationSettings: ouvert.flagged ? "'FILL' 1" : "'FILL' 0" }}>star</span>
                </button>
                <button className="sc-iconbtn" title="Supprimer" onClick={() => agir('corbeille', [ouvert.id])}>
                  <span className="ms" style={{ color: C.rouge }}>delete</span>
                </button>
              </div>
            </div>

            {/* Le HTML d'un message reçu est du code tiers : iframe sandbox. */}
            {ouvert.body_html ? (
              <iframe srcDoc={ouvert.body_html} title="Message" sandbox=""
                      style={{ width: '100%', height: mobile ? 420 : 620, border: 'none', background: '#fff' }} />
            ) : (
              <div style={{ padding: '20px 22px', fontSize: 14, lineHeight: 1.72, color: C.corps, whiteSpace: 'pre-wrap' }}>
                {ouvert.body_text || '(message vide)'}
              </div>
            )}

            {!!ouvert.attachments?.length && (
              <div style={{ padding: '13px 22px', borderTop: `1px solid ${C.ligne}`, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {ouvert.attachments.map((a: any, i: number) => (
                  <button key={i} className="sc-chip" style={{ fontSize: 11, cursor: 'pointer', border: 'none' }}
                          onClick={() => downloadAuth(`/api/inbox/attachment?id=${ouvert.id}&i=${i}`, a.filename || 'piece-jointe').catch(e => say(e.message))}>
                    <span className="ms" style={{ fontSize: 14 }}>download</span>
                    {a.filename} · {Math.round((a.size || 0) / 1024)} ko
                  </button>
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
      <div style={{
        display: 'flex', height: hauteur, margin: '-16px -18px -90px',
        overflow: 'hidden', border: `1px solid ${C.border}`,
      }}>
        {!mobile && colDossiers}

        {/* Tiroir des dossiers, sur mobile uniquement */}
        {mobile && tiroir && (
          <>
            <div onClick={() => setTiroir(false)}
                 style={{ position: 'fixed', inset: 0, background: 'rgba(21,24,30,.42)', zIndex: 200 }} />
            <div style={{
              position: 'fixed', top: 48, bottom: 58, left: 0, width: 250, zIndex: 210,
              boxShadow: '6px 0 28px rgba(21,24,30,.16)',
            }}>
              {colDossiers}
            </div>
          </>
        )}
        {(!mobile || !ouvert) && colListe}
        {(!mobile || ouvert) && colLecture}
      </div>

      {redac && (
        <Redaction valeur={redac} carnet={carnet} modeles={modeles} mobile={mobile} say={say}
                   onChange={setRedac} onFermer={() => setRedac(null)}
                   onEnvoye={() => { setRedac(null); charger(0); }} />
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: mobile ? 70 : 24, right: 24, background: C.ink, color: '#fff',
          padding: '10px 18px', borderRadius: 7, fontSize: 12.5, zIndex: 300, maxWidth: 'calc(100vw - 48px)',
        }}>{toast}</div>
      )}
    </>
  );
}
