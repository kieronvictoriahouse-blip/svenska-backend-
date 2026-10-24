'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminFetch, downloadAuth } from '@/lib/auth-client';
import Redaction, { Brouillon, corpsTexte } from './Redaction';
import {
  C, COULEUR_ETIQ, couleurDe, initiales, quand, depuis,
  Msg, ItemNav, GroupeNav, LigneMessage, Vide, BM_CSS, useRetourMobile, neutraliserHtml,
} from './ui';
import EmailApercu from '@/components/EmailApercu';
import { useT } from '@/lib/admin-i18n';
import { TBM } from './i18n';

/* ═══════════════════════════════════════════════════════════════
   BOÎTE MAIL — la boîte du marchand (IMAP)

   Trois panneaux : dossiers 228 px · liste 392 px (340 sous 1320 px)
   · lecture. Les seuils sont calculés en JS comme le demande le
   handoff, mais **alignés sur ceux du shell** : bascule mobile à
   900 px, et la hauteur réserve la topbar (48 px) plus la barre
   d'onglets (58 px) quand elle est là. Les deux désaccordés faisaient
   déborder l'écran sur téléphone.

   Sur téléphone, c'est une application mail : la liste, puis le
   message en plein écran (barre du haut : retour, suivre, non lu,
   corbeille ; en bas, à portée de pouce : répondre, répondre à tous,
   transférer), le HTML réduit à la largeur de l'écran, la rédaction
   en plein écran avec « Envoyer » en haut. Le bouton retour du
   téléphone ferme la couche ouverte au lieu de quitter la boîte.

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
  const { t, tc, lang } = useT(TBM);
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
  /* Le compte IMAP vient de l'API — jamais en dur dans l'écran. */
  const [compteImap, setCompteImap] = useState('');
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

  // Retour du téléphone : ferme le tiroir, le message, la rédaction.
  useRetourMobile('dossiers', mobile && tiroir, () => setTiroir(false));
  useRetourMobile('lecture', mobile && !!ouvert, () => setOuvert(null));
  useRetourMobile('redaction', mobile && !!redac, () => setRedac(null));

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
        if (d.compte) setCompteImap(d.compte);
      }
    } catch { say(t('msgChargement')); }
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
      } catch { say(t('msgDossier')); }
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
    } catch { say(t('msgMessage')); }
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
      const res = await adminFetch('/api/inbox', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: liste, action, label }),
      });
      /* Un refus du serveur (IMAP injoignable…) laissait l'écran sur
         l'état optimiste : message « supprimé » encore sur le serveur. */
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        say(d.error || t('msgAction')); charger(0);
      }
    } catch { say(t('msgAction')); charger(0); }
  }

  async function annulerProgramme(id: string) {
    try {
      const res = await adminFetch(`/api/inbox/scheduled?id=${id}`, { method: 'DELETE' });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      say(t('msgEnvoiAnnule'));
      charger(0);
    } catch (e: any) { say(e.message); }
  }

  async function supprimerBrouillon(id: string) {
    const res = await adminFetch(`/api/inbox/drafts?id=${id}`, { method: 'DELETE' });
    if (!res.ok) { say(t('msgAction')); return; }
    setBrouillons(b => b.filter(x => x.id !== id));
    say(t('msgBrouillonSuppr'));
  }

  /* Texte du message d'origine, pour la citation et le transfert : un
     email seulement en HTML n'a pas de body_text — le transfert partait
     vide. */
  const texteDe = (m: Msg) => m.body_text
    || String(m.body_html || '').replace(/<(style|script)[\s\S]*?<\/\1>/gi, '').replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|tr|h\d)>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
      .replace(/\n{3,}/g, '\n\n').trim()
    || m.preview || '';

  function repondre(m: Msg, tous = false) {
    const moi = String(compte || '').toLowerCase();
    const de = String(m.from_email || '').toLowerCase();
    // Réponse à un message que l'on a soi-même envoyé : on écrit à ses destinataires.
    const envoyeParMoi = !!moi && de === moi;
    const vus = new Set<string>([moi, ...(envoyeParMoi ? [] : [de])]);
    const unique = (l?: string[]) => (l || []).map(e => String(e || '').trim()).filter(e => {
      const k = e.toLowerCase();
      if (!k || vus.has(k)) return false;
      vus.add(k); return true;
    });
    const a = envoyeParMoi ? unique(m.to_emails).join(', ') : (m.from_email || '');
    /* Répondre à tous : destinataires ET copies d'origine, sans notre
       propre adresse ni l'expéditeur en double (les Cc étaient oubliés,
       et la comparaison tenait compte des majuscules). */
    const cc = tous ? [...(envoyeParMoi ? [] : unique(m.to_emails)), ...unique(m.cc_emails)].join(', ') : '';
    const re = /^re\s*:/i.test(m.subject || '');
    const date = m.sent_at ? new Date(m.sent_at).toLocaleString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    const citation = texteDe(m).split('\n').map(l => `> ${l}`).join('\n');
    setRedac({
      to: a, cc, subject: re ? (m.subject || '') : `Re : ${m.subject || ''}`,
      corps: `\n\n${date ? `Le ${date}, ` : ''}${m.from_name || m.from_email} a écrit :\n${citation}`,
      repond: m.message_id || undefined,
    });
  }

  function transferer(m: Msg) {
    const tr = /^tr\s*:/i.test(m.subject || '');
    setRedac({
      to: '', cc: '', subject: tr ? (m.subject || '') : `Tr : ${m.subject || ''}`,
      corps: `\n\n---------- Message transféré ----------\nDe : ${m.from_email}\nObjet : ${m.subject}\n\n${texteDe(m)}`,
    });
  }

  const inbox = etat.find(e => e.folder === 'INBOX');
  const compte = compteImap;
  // HTML du message ouvert, nettoyé une fois (et seulement sur téléphone, où l'iframe est same-origin).
  const htmlMobile = useMemo(
    () => (mobile && ouvert?.body_html ? neutraliserHtml(ouvert.body_html) : ''),
    [mobile, ouvert?.body_html],
  );
  /* Hauteur disponible : la page vit dans .sc-main, sous la topbar de
     48 px, et au-dessus de la barre d'onglets (58 px) sur mobile. La
     classe .bm-root (BM_CSS) porte la hauteur et les marges négatives
     qui annulent le padding de .sc-screen — celui-ci n'est pas le même
     sur téléphone (12 px) et sur ordinateur (16/18 px), d'où une classe
     plutôt qu'un calcul en ligne, qui débordait de 6 px de chaque côté. */

  const nouveauMessage = () => setRedac({ to: '', cc: '', subject: '', corps: '' });
  /* L'étoile du message ouvert : sans mettre à jour `ouvert`, l'icône
     ne changeait pas sous le doigt. */
  const suivreOuvert = (m: Msg) => { setOuvert({ ...m, flagged: !m.flagged }); agir('etoile', [m.id]); };

  /* ── Colonne 1 : dossiers ─────────────────────────────── */
  const colDossiers = (
    <div style={{ width: mobile ? '100%' : 228, flexShrink: 0, background: C.sidebar, borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: 12, borderBottom: `1px solid ${C.ligneFaible}` }}>
        <button className="sc-btn" style={{ width: '100%', height: 38, justifyContent: 'center', background: C.ink, color: '#fff', border: 'none' }}
                onClick={() => { nouveauMessage(); setTiroir(false); }}>
          <span className="ms">edit</span>{t('nouveauMessage')}
        </button>
        <button className="sc-btn sc-btn-secondary bm-sous" onClick={relever} disabled={synchro}
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

      <div className="bm-pied" style={{ padding: '10px 13px', borderTop: `1px solid ${C.ligneFaible}`, fontSize: 10.5, color: C.t4, overflowWrap: 'anywhere' }}>
        <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: 3, background: inbox?.last_error ? C.rouge : '#3E7A4E', marginRight: 6 }} />
        {inbox?.last_error ? 'IMAP en erreur' : 'IMAP connecté'}{compte ? ` · ${compte}` : ''}
      </div>
    </div>
  );

  /* ── Colonne 2 : liste ────────────────────────────────── */
  const colListe = (
    <div style={{ width: mobile ? '100%' : (etroit ? 340 : 392), flexShrink: 0, background: C.sidebar, borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flexShrink: 0, background: C.surface, borderBottom: `1px solid ${C.border}`, padding: mobile ? '6px 12px 10px' : '11px 14px' }}>
        {/* Titre de la vue. Sur téléphone, sur la même ligne que le
            tiroir des dossiers, « Relever » et « Écrire » : trois rangées
            de boutons avant le premier message, c'était trop. */}
        {(() => {
          const titre = (
            <>
              <div className="bm-titre-liste" style={{ fontSize: 15, fontWeight: 600, color: C.t1, overflow: mobile ? 'hidden' : undefined, textOverflow: 'ellipsis', whiteSpace: mobile ? 'nowrap' : undefined }}>
                {VUES.find(v => v.id === vue)?.label || dossiers.find(d => d.path === vue)?.nom || vue}
                {etiquette && <span className="bm-sous" style={{ fontSize: 11.5, fontWeight: 400, color: couleurDe(etiquette) }}> · {etiquette}</span>}
              </div>
              <div className="bm-sous" style={{ fontSize: 11, color: C.t4 }}>
                {virtuelle
                  ? `${(vue === 'drafts' ? brouillons : programmes).length} élément(s)`
                  : `${total} message${total > 1 ? 's' : ''}${messages.length < total ? ` · ${messages.length} affichés` : ''}`}
              </div>
            </>
          );
          return mobile ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: virtuelle ? 0 : 8 }}>
              <button className="sc-iconbtn" aria-label={t('dossiers')} onClick={() => setTiroir(true)} style={{ marginLeft: -8 }}>
                <span className="ms">menu</span>
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>{titre}</div>
              <button className="sc-iconbtn" aria-label={t('relever')} title={`${t('relever')} · ${depuis(inbox?.last_sync_at)}`}
                      onClick={relever} disabled={synchro}>
                <span className="ms" style={{ animation: synchro ? 'sc-spin .9s linear infinite' : 'none' }}>sync</span>
              </button>
              <button className="sc-btn sc-btn-primary" onClick={nouveauMessage} style={{ padding: '10px 14px' }}>
                <span className="ms">edit</span>{t('ecrire')}
              </button>
            </div>
          ) : titre;
        })()}

        {!virtuelle && (
          <>
            {/* Un formulaire : la touche « Rechercher » du clavier du
                téléphone le soumet, comme Entrée sur ordinateur. */}
            <form role="search" style={{ position: 'relative', marginTop: mobile ? 0 : 9 }}
                  onSubmit={e => { e.preventDefault(); setRecherche(q); }}>
              <span className="ms bm-search-ic" style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: C.t5, pointerEvents: 'none' }}>search</span>
              <input className="sc-input bm-search" type="search" enterKeyHint="search" value={q}
                     onChange={e => { setQ(e.target.value); if (!e.target.value) setRecherche(''); }}
                     placeholder={t('phRecherche')} aria-label={t('phRecherche')} />
            </form>

            <div style={{ display: 'flex', gap: mobile ? 6 : 4, marginTop: 8 }}>
              {[['tous', 'Tous'], ['non-lus', 'Non lus'], ['pieces-jointes', 'Pièce jointe']].map(([id, lab]) => (
                <button key={id} onClick={() => setFiltre(id)} className="bm-filtre" aria-pressed={filtre === id}
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
            <span className="bm-sel" style={{ flex: 1, fontSize: 11.5, color: C.selTexte, fontWeight: 600 }}>{sel.size} sélectionné{sel.size > 1 ? 's' : ''}</span>
            <button className="sc-iconbtn" title={t('marquerLu')} onClick={() => agir('lu')}><span className="ms">mark_email_read</span></button>
            <button className="sc-iconbtn" title={t('marquerNonLu')} onClick={() => agir('non-lu')}><span className="ms">mark_email_unread</span></button>
            <button className="sc-iconbtn" title={t('corbeille')} onClick={() => agir('corbeille')}><span className="ms" style={{ color: C.rouge }}>delete</span></button>
            <button className="sc-iconbtn" title={tc('cancel')} onClick={() => setSel(new Set())}><span className="ms">close</span></button>
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
                     corps: corpsTexte(b.body || ''), repond: b.in_reply_to || undefined,
                     /* Les pièces jointes du brouillon : sans elles, rouvrir
                        puis envoyer partait sans les fichiers. */
                     pj: (Array.isArray(b.attachments) ? b.attachments : []).map((a: any) => ({
                       filename: a.filename, content: a.content, taille: Math.round(String(a.content || '').length * 3 / 4),
                     })),
                   })}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.t1 }}>{b.subject || '(sans objet)'}</div>
                  <div className="bm-sous" style={{ fontSize: 11.5, color: C.t5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {b.to_emails || 'sans destinataire'} · modifié {depuis(b.updated_at)}
                  </div>
                </div>
                <button className="sc-iconbtn" aria-label={tc('delete')} onClick={e => { e.stopPropagation(); supprimerBrouillon(b.id); }}>
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
                  <div className="bm-sous" style={{ fontSize: 11.5, color: C.t5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.to_emails} · {new Date(s.send_at).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </div>
                  {s.last_error && <div className="bm-sous" style={{ fontSize: 10.5, color: C.rouge }}>{s.last_error}</div>}
                </div>
                <span className="sc-badge" style={{
                  background: s.status === 'sent' ? '#E9F0E6' : s.status === 'failed' ? '#FBE7E4' : s.status === 'cancelled' ? '#F1EDE7' : '#FBF0DA',
                  color: s.status === 'sent' ? '#3E5238' : s.status === 'failed' ? '#B03A2E' : s.status === 'cancelled' ? '#857C71' : '#8A5B08',
                }}>
                  {s.status === 'sent' ? 'Envoyé' : s.status === 'failed' ? 'Échec'
                    : s.status === 'cancelled' ? 'Annulé' : s.status === 'sending' ? 'En cours'
                    /* L'heure est passée mais rien n'a tourné depuis : il partira
                       à la prochaine relève (ou au passage automatique du matin). */
                    : +new Date(s.send_at) <= Date.now() ? 'À la prochaine relève' : 'En attente'}
                </span>
                {s.status === 'pending' && (
                  <button className="sc-iconbtn" title={tc('cancel')} onClick={() => annulerProgramme(s.id)}>
                    <span className="ms" style={{ color: C.rouge }}>cancel</span>
                  </button>
                )}
              </div>
            ))
        ) : chargement && messages.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', fontSize: 12.5, color: C.t4 }}>{tc('loading')}</div>
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

  /* Pièces jointes : même rendu à la lecture sur ordinateur et téléphone. */
  const piecesJointes = (m: Msg) => !!m.attachments?.length && (
    <div style={{ padding: mobile ? '12px 16px' : '13px 22px', borderTop: `1px solid ${C.ligne}`, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {m.attachments.map((a: any, i: number) => (
        <button key={i} className="sc-chip" style={{ fontSize: mobile ? 13 : 11, cursor: 'pointer', border: 'none', maxWidth: '100%', minHeight: mobile ? 44 : undefined }}
                onClick={() => downloadAuth(`/api/inbox/attachment?id=${m.id}&i=${i}`, a.filename || 'piece-jointe').catch(e => say(e.message))}>
          <span className="ms" style={{ fontSize: mobile ? 18 : 14 }}>download</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.filename}</span> · {Math.round((a.size || 0) / 1024)} ko
        </button>
      ))}
    </div>
  );

  /* ── Colonne 3 : lecture — téléphone ─────────────────────
     Plein écran. En haut : retour et les gestes de tri ; en bas, collés
     au-dessus des onglets : répondre, répondre à tous, transférer. Le
     HTML est réduit à la largeur de l'écran au lieu d'être coupé. */
  const lectureMobile = (m: Msg) => (
    <div style={{ flex: 1, minWidth: 0, background: C.surface, height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
      <div style={{
        position: 'sticky', top: 0, zIndex: 3, display: 'flex', alignItems: 'center', gap: 2,
        padding: '4px 6px', background: C.surface, borderBottom: `1px solid ${C.border}`,
      }}>
        <button className="sc-iconbtn" aria-label={t('retourListe')} onClick={() => setOuvert(null)}>
          <span className="ms">arrow_back</span>
        </button>
        <span style={{ flex: 1 }} />
        <button className="sc-iconbtn" aria-label={t('suivre')} aria-pressed={m.flagged} onClick={() => suivreOuvert(m)}>
          <span className="ms" style={{ color: m.flagged ? C.etoile : C.t4, fontVariationSettings: m.flagged ? "'FILL' 1" : "'FILL' 0" }}>star</span>
        </button>
        <button className="sc-iconbtn" aria-label={t('marquerNonLu')} onClick={() => { agir('non-lu', [m.id]); setOuvert(null); }}>
          <span className="ms">mark_email_unread</span>
        </button>
        <button className="sc-iconbtn" aria-label={t('corbeille')} onClick={() => agir('corbeille', [m.id])}>
          <span className="ms" style={{ color: C.rouge }}>delete</span>
        </button>
      </div>

      <div style={{ padding: '16px 16px 12px' }}>
        <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 24, fontWeight: 600, color: C.t1, lineHeight: 1.2, overflowWrap: 'anywhere' }}>
          {m.subject || '(sans objet)'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 20, flexShrink: 0, display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 13, fontWeight: 600,
            background: `${couleurDe(m.label)}1A`, color: couleurDe(m.label),
          }}>{initiales(m.from_name || m.from_email)}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: C.t1, overflowWrap: 'anywhere' }}>{m.from_name || m.from_email}</div>
            <div style={{ fontSize: 13, color: C.t4, overflowWrap: 'anywhere' }}>{m.from_email}</div>
          </div>
          <span className="sc-num" style={{ fontSize: 13, color: C.t4, flexShrink: 0, alignSelf: 'flex-start', paddingTop: 2 }}>{quand(m.sent_at)}</span>
        </div>
        <select value={m.label || ''} className="sc-select" aria-label={t('etiquette')}
                style={{ marginTop: 12, width: 'auto', maxWidth: '100%', color: m.label ? couleurDe(m.label) : C.t3 }}
                onChange={e => { const l = e.target.value; setOuvert({ ...m, label: l || null }); agir('etiquette', [m.id], l); }}>
          <option value="">{t('sansEtiquette')}</option>
          {Object.keys(COULEUR_ETIQ).map(l => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>

      {/* Le HTML d'un message reçu est du code tiers : iframe sandbox, sans
          script. allow-same-origin sert seulement à mesurer le contenu
          pour le réduire à la largeur de l'écran — d'où neutraliserHtml,
          qui retire toute ressource chargée depuis le back-office. */}
      <div style={{ borderTop: `1px solid ${C.ligne}` }}>
        {m.body_html ? (
          <EmailApercu html={htmlMobile} title={t('message')} ajuster sandbox="allow-same-origin" />
        ) : (
          <div style={{ padding: '16px 16px 24px', fontSize: 16, lineHeight: 1.6, color: C.corps, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {m.body_text || '(message vide)'}
          </div>
        )}
      </div>
      {piecesJointes(m)}

      <span style={{ flex: 1 }} />
      <div style={{
        position: 'sticky', bottom: 0, zIndex: 3, display: 'flex', gap: 6, padding: '8px 10px',
        background: C.surface, borderTop: `1px solid ${C.border}`, boxShadow: '0 -6px 18px rgba(21,24,30,.06)',
      }}>
        {([
          ['reply', t('repondre'), () => repondre(m)],
          ['reply_all', t('repondreTous'), () => repondre(m, true)],
          ['forward', t('transferer'), () => transferer(m)],
        ] as Array<[string, string, () => void]>).map(([ic, lab, fn], i) => (
          <button key={ic} onClick={fn} className={`sc-btn ${i === 0 ? 'sc-btn-primary' : 'sc-btn-secondary'}`}
                  style={{ flex: '1 1 0', minWidth: 0, flexDirection: 'column', gap: 2, padding: '6px 4px', minHeight: 54, fontSize: 12.5, whiteSpace: 'normal', lineHeight: 1.15, textAlign: 'center' }}>
            <span className="ms" style={{ fontSize: 21 }}>{ic}</span>{lab}
          </button>
        ))}
      </div>
    </div>
  );

  /* ── Colonne 3 : lecture — ordinateur ─────────────────── */
  const colLecture = mobile && ouvert ? lectureMobile(ouvert) : (
    <div style={{ flex: 1, minWidth: 0, background: C.lecture, height: '100%', overflowY: 'auto' }}>
      {!ouvert ? (
        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: C.t4 }}>
          <span className="ms" style={{ fontSize: 44, color: C.t6 }}>mail</span>
          <div style={{ fontSize: 13, marginTop: 10 }}>{t('selectionne')}</div>
        </div>
      ) : (
        <div style={{ padding: 26 }}>
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
                  <option value="">{t('sansEtiquette')}</option>
                  {Object.keys(COULEUR_ETIQ).map(l => <option key={l} value={l}>{l}</option>)}
                </select>
                <button className="sc-btn sc-btn-secondary" style={{ padding: '5px 10px', fontSize: 11.5 }} onClick={() => repondre(ouvert)}>
                  <span className="ms">reply</span>{t('repondre')}
                </button>
                <button className="sc-iconbtn" title={t('repondreTous')} onClick={() => repondre(ouvert, true)}><span className="ms">reply_all</span></button>
                <button className="sc-iconbtn" title={t('transferer')} onClick={() => transferer(ouvert)}><span className="ms">forward</span></button>
                <button className="sc-iconbtn" title={t('suivre')} onClick={() => suivreOuvert(ouvert)}>
                  <span className="ms" style={{ color: ouvert.flagged ? C.etoile : C.t6, fontVariationSettings: ouvert.flagged ? "'FILL' 1" : "'FILL' 0" }}>star</span>
                </button>
                <button className="sc-iconbtn" title={tc('delete')} onClick={() => agir('corbeille', [ouvert.id])}>
                  <span className="ms" style={{ color: C.rouge }}>delete</span>
                </button>
              </div>
            </div>

            {/* Le HTML d'un message reçu est du code tiers : iframe sandbox. */}
            {ouvert.body_html ? (
              <EmailApercu html={ouvert.body_html} title={t('message')} ajuster={false} sandbox=""
                           style={{ width: '100%', height: 620, border: 'none', background: '#fff' }} />
            ) : (
              <div style={{ padding: '20px 22px', fontSize: 14, lineHeight: 1.72, color: C.corps, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                {ouvert.body_text || '(message vide)'}
              </div>
            )}

            {piecesJointes(ouvert)}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: BM_CSS }} />
      <div className="bm-root">
        {!mobile && colDossiers}

        {/* Tiroir des dossiers, sur mobile uniquement */}
        {mobile && tiroir && (
          <>
            <div onClick={() => setTiroir(false)}
                 style={{ position: 'fixed', inset: 0, background: 'rgba(21,24,30,.42)', zIndex: 200 }} />
            <div role="dialog" aria-label={t('dossiers')} style={{
              position: 'fixed', top: 48, bottom: 58, left: 0, width: 'min(300px, 86vw)', zIndex: 210,
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

      {toast && <div className="bm-toast" role="status">{toast}</div>}
    </>
  );
}
