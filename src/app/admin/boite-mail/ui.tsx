'use client';
import React, { useEffect, useRef } from 'react';

/* ═══════════════════════════════════════════════════════════════
   BOÎTE MAIL — briques d'affichage

   Sorties du fichier de page pour que celui-ci reste lisible : la
   version précédente faisait 600 lignes construites par retouches
   successives, et cassait à chaque modification.

   Tokens repris du handoff, identiques au reste du back-office.
   ═══════════════════════════════════════════════════════════════ */

export const C = {
  ink: '#1C2028', sidebar: '#FCFAF7', lecture: '#F1EEE9', surface: '#FFFFFF',
  border: '#E7E1D8', ligne: '#F1EDE7', ligneFaible: '#F6F3EE', champ: '#E1DBD2',
  t1: '#1C2028', corps: '#3A3630', t2: '#5A5248', t3: '#6E6459',
  t4: '#8B7E72', t5: '#9C9184', t6: '#A79C8E',
  accent: '#7B4F7B', accentFond: '#7B4F7B14', accentBord: '#7B4F7B66',
  selFond: '#F3EDF3', selBord: '#E3D6E3', selTexte: '#5E3B5E',
  etoile: '#C9A227', vert: '#3E5238', rouge: '#B03A2E',
};

/* ── Téléphone (< 900 px, seuil du shell) ─────────────────────────
   Les styles en ligne restent ceux de l'ordinateur ; les classes bm-*
   les corrigent sous 900 px. La boîte devient une application mail :
   liste → message → retour, rédaction plein écran. */
export const BM_CSS = `
  @keyframes sc-spin { to { transform: rotate(360deg) } }
  .bm-root { display: flex; height: calc(100vh - 64px); margin: -16px -18px -90px; overflow: hidden; border: 1px solid ${C.border}; }
  .bm-search { width: 100%; height: 30px; padding-left: 30px; font-size: 12px; }
  .bm-toast { position: fixed; bottom: 24px; right: 24px; max-width: calc(100vw - 48px); background: ${C.ink}; color: #fff; padding: 10px 18px; border-radius: 7px; font-size: 12.5px; z-index: 300; }
  @media (max-width: 899px) {
    /* La boîte occupe exactement la zone entre la topbar (48) et les onglets (58) */
    .bm-root { height: calc(100vh - 106px); height: calc(100dvh - 106px); margin: -12px -12px -28px; border: none; }
    .bm-search { height: 44px; padding-left: 40px; font-size: 16px; }
    .bm-search-ic { left: 12px !important; font-size: 20px !important; }
    .bm-toast { left: 12px; right: 12px; bottom: calc(58px + 74px + env(safe-area-inset-bottom)); max-width: none; font-size: 14px; padding: 12px 16px; text-align: center; }

    /* Liste */
    .bm-ligne { padding: 12px 12px 12px 9px !important; gap: 12px !important; }
    .bm-av { width: 40px !important; height: 40px !important; border-radius: 20px !important; font-size: 13px !important; }
    .bm-de { font-size: 15px !important; }
    .bm-quand { font-size: 12px !important; }
    .bm-objet { font-size: 14px !important; margin-top: 2px !important; }
    .bm-apercu { font-size: 13px !important; }
    .bm-etiq { font-size: 11.5px !important; padding: 2px 8px !important; }
    .bm-etoile { width: 44px; height: 44px; margin: -14px -12px -14px -8px !important; display: inline-flex !important; align-items: center; justify-content: center; flex-shrink: 0; }
    .bm-etoile .ms { font-size: 22px !important; }
    .bm-vide { font-size: 14px !important; }
    .bm-sous { font-size: 12.5px !important; }
    .bm-titre-liste { font-size: 17px !important; }
    .bm-filtre { min-height: 40px; padding: 0 14px !important; font-size: 14px !important; border: 1px solid ${C.border} !important; border-radius: 8px !important; }
    .bm-sel { font-size: 13.5px !important; }

    /* Tiroir des dossiers */
    .bm-nav { min-height: 46px; font-size: 15px !important; }
    .bm-nav .sc-num { font-size: 12px !important; min-width: 22px !important; height: 20px !important; border-radius: 10px !important; }
    .bm-grp { font-size: 11px !important; letter-spacing: 1.6px !important; padding-top: 6px !important; }
    .bm-pied { font-size: 12px !important; }
  }
`;

/** Bouton « retour » du téléphone (Android, geste iOS) : il ferme la
 *  couche ouverte (message, rédaction) au lieu de quitter la boîte.
 *  Chaque couche ouverte pousse une entrée d'historique sur la même URL ;
 *  la fermer par l'interface retire cette entrée. Rien sur ordinateur. */
export function useRetourMobile(cle: string, actif: boolean, fermer: () => void) {
  const pousse = useRef(false);
  const fermerRef = useRef(fermer);
  fermerRef.current = fermer;

  useEffect(() => {
    if (actif && !pousse.current) {
      const couches: string[] = (window.history.state && window.history.state.scCouches) || [];
      window.history.pushState({ ...(window.history.state || {}), scCouches: [...couches, cle] }, '');
      pousse.current = true;
    } else if (!actif && pousse.current) {
      pousse.current = false;
      window.history.back();
    }
  }, [actif, cle]);

  useEffect(() => {
    const onPop = () => {
      const couches: string[] = (window.history.state && window.history.state.scCouches) || [];
      if (pousse.current && !couches.includes(cle)) { pousse.current = false; fermerRef.current(); }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [cle]);
}

export const COULEUR_ETIQ: Record<string, string> = {
  Clients: '#7B4F7B', Fournisseurs: '#1C4E80', Logistique: '#3E5238',
  'Comptabilité': '#8A5B08', Marketing: '#A6501F',
};
export const couleurDe = (l?: string | null) => (l && COULEUR_ETIQ[l]) || '#857C71';

export const initiales = (s?: string | null) =>
  String(s || '?').trim().split(/[\s@.]+/).filter(Boolean).slice(0, 2)
    .map(w => w[0]).join('').toUpperCase();

export function quand(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso), now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }
  const memeAnnee = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString('fr-FR',
    memeAnnee ? { day: '2-digit', month: 'short' } : { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export function depuis(iso?: string | null) {
  if (!iso) return 'jamais';
  const m = Math.floor((Date.now() - +new Date(iso)) / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  return h < 24 ? `il y a ${h} h` : `il y a ${Math.floor(h / 24)} j`;
}

export type Msg = {
  id: string; folder: string; uid: number; message_id?: string;
  from_name?: string; from_email?: string; to_emails?: string[];
  subject?: string; preview?: string; seen: boolean; flagged: boolean;
  label?: string | null; attachments?: any[]; has_attachment?: boolean;
  sent_at?: string; body_html?: string; body_text?: string;
};

/** Entrée de la colonne de gauche — même gabarit pour les vues et les dossiers. */
export function ItemNav(p: {
  icone: string; label: string; actif: boolean; compteur?: number;
  pastille?: boolean; carre?: string; onClick: () => void;
}) {
  return (
    <button onClick={p.onClick} className="bm-nav"
            style={{
              display: 'flex', alignItems: 'center', gap: 10, width: 'calc(100% - 16px)',
              margin: '0 8px 2px', padding: '7px 13px', borderRadius: 7, border: 'none',
              cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, textAlign: 'left',
              background: p.actif ? C.accentFond : 'transparent',
              color: p.actif ? C.accent : C.t2, fontWeight: p.actif ? 600 : 400,
            }}>
      {p.carre
        ? <span style={{ width: 8, height: 8, borderRadius: 2, background: p.carre, flexShrink: 0 }} />
        : <span className="ms" style={{ fontSize: 19, fontVariationSettings: p.actif ? "'wght' 400" : "'wght' 300" }}>{p.icone}</span>}
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {p.label}
      </span>
      {!!p.compteur && (
        p.pastille ? (
          <span className="sc-num" style={{
            minWidth: 19, height: 17, borderRadius: 9, display: 'inline-flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 10, fontWeight: 700, padding: '0 5px',
            background: p.actif ? C.accent : '#EFEBE4', color: p.actif ? '#fff' : '#857C71',
          }}>{p.compteur}</span>
        ) : (
          <span className="sc-num" style={{ fontSize: 10, color: p.actif ? C.accent : C.t5 }}>{p.compteur}</span>
        )
      )}
    </button>
  );
}

export function GroupeNav({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 12 }}>
      <div className="bm-grp" style={{
        padding: '0 13px 6px', fontSize: 8.5, letterSpacing: 2.2, textTransform: 'uppercase',
        color: C.t5, fontWeight: 600,
      }}>{titre}</div>
      {children}
    </div>
  );
}

/** Une ligne de la liste. La bordure gauche de 3 px porte l'état. */
export function LigneMessage(p: {
  m: Msg; actif: boolean; coche: boolean;
  onOuvrir: () => void; onCocher: () => void; onEtoile: () => void;
}) {
  const { m } = p;
  /* Sur téléphone (classes bm-* de la page) : pastille de 40 px, textes
     ≥ 12 px, étoile dans une cible de 44 px. L'ordinateur garde ses
     valeurs en ligne. */
  return (
    <div onClick={p.onOuvrir} className="bm-ligne"
         style={{
           display: 'flex', gap: 11, padding: '11px 14px', cursor: 'pointer',
           borderBottom: `1px solid ${C.ligne}`,
           borderLeft: `3px solid ${p.actif ? C.accent : (!m.seen ? C.accentBord : 'transparent')}`,
           background: p.actif || !m.seen ? C.surface : 'transparent',
         }}>
      <div onClick={e => { e.stopPropagation(); p.onCocher(); }} className="bm-av"
           role="checkbox" aria-checked={p.coche} aria-label={`Sélectionner ${m.from_name || m.from_email || ''}`}
           style={{
             width: 30, height: 30, borderRadius: 15, flexShrink: 0, display: 'flex',
             alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600,
             background: p.coche ? C.accent : `${couleurDe(m.label)}1A`,
             color: p.coche ? '#fff' : couleurDe(m.label),
           }}>
        {p.coche ? <span className="ms" style={{ fontSize: 17 }}>check</span> : initiales(m.from_name || m.from_email)}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span className="bm-de" style={{
            flex: 1, minWidth: 0, fontSize: 13, fontWeight: m.seen ? 500 : 700, color: C.t1,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{m.from_name || m.from_email}</span>
          <span className="sc-num bm-quand" style={{ fontSize: 10.5, color: C.t5, flexShrink: 0 }}>{quand(m.sent_at)}</span>
        </div>
        <div className="bm-objet" style={{
          fontSize: 12.5, fontWeight: m.seen ? 400 : 600, color: C.t2, marginTop: 1,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{m.subject}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
          <span className="bm-apercu" style={{
            flex: 1, minWidth: 0, fontSize: 11.5, color: C.t5,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{m.preview}</span>
          {m.label && (
            <span className="bm-etiq" style={{
              fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 20,
              background: `${couleurDe(m.label)}18`, color: couleurDe(m.label), whiteSpace: 'nowrap',
            }}>{m.label}</span>
          )}
          {(m.has_attachment || !!m.attachments?.length) && <span className="ms" style={{ fontSize: 15, color: C.t5 }}>attach_file</span>}
          <button onClick={e => { e.stopPropagation(); p.onEtoile(); }} className="bm-etoile"
                  aria-label={m.flagged ? 'Ne plus suivre' : 'Suivre'} aria-pressed={m.flagged}
                  style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }}>
            <span className="ms" style={{
              fontSize: 16, color: m.flagged ? C.etoile : C.t6,
              fontVariationSettings: m.flagged ? "'FILL' 1" : "'FILL' 0",
            }}>star</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export function Vide({ icone, texte }: { icone: string; texte: string }) {
  return (
    <div style={{ padding: '54px 20px', textAlign: 'center', color: C.t4 }}>
      <span className="ms" style={{ fontSize: 34, color: C.t6, display: 'block', marginBottom: 8 }}>{icone}</span>
      <div className="bm-vide" style={{ fontSize: 12.5 }}>{texte}</div>
    </div>
  );
}
