'use client';
import React from 'react';
import {
  Enrichi, Fournisseur, URGENCE_COULEUR, URGENCE_LABEL,
  libelleCouverture, eur, kr,
} from './calculs';

/* Briques de l'écran de commande d'achat. Tokens du handoff. */

export const C = {
  ink: '#1C2028', inkHover: '#2C3240', nuit: '#15181E',
  surface: '#FFFFFF', surfaceAlt: '#FBF9F6', fond: '#F7F4EF',
  border: '#E7E1D8', champ: '#E1DBD2', ligne: '#F1EDE7', ligneFaible: '#F6F3EE',
  t1: '#1C2028', t2: '#5A5248', t3: '#6E6459', t4: '#8B7E72', t5: '#9C9184', t6: '#A79C8E',
  accent: '#7B4F7B', or: '#B49256', orClair: '#D9BE86',
  vert: '#3E5238', vertFond: '#FAFCF9', vertBord: '#CFE0C8',
  ambre: '#8A5B08', rouge: '#B03A2E',
};

/** Nom français puis nom suédois — exigence transversale du handoff :
 *  c'est le vocabulaire des tickets, des cartons et des fournisseurs. */
export function NomProduit({ p, taille = 13 }: { p: Enrichi; taille?: number }) {
  return (
    <>
      <div style={{ fontSize: taille, fontWeight: 600, color: C.t1, lineHeight: 1.3 }}>{p.name}</div>
      {p.name_sv && (
        <div style={{ fontSize: 11, color: C.t5, fontStyle: 'italic', marginTop: 1 }}>{p.name_sv}</div>
      )}
    </>
  );
}

/** Photo du produit ; la vignette d'initiale ne sert que de repli —
 *  elle rend visible qu'une fiche est incomplète. */
export function Vignette({ p, taille }: { p: Enrichi; taille: number }) {
  const commun: React.CSSProperties = {
    width: taille, height: taille, borderRadius: 7, flexShrink: 0,
    objectFit: 'cover', background: C.fond,
  };
  if (p.image_url) return <img src={p.image_url} alt="" style={commun} />;
  return (
    <div style={{
      ...commun, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: taille * 0.4, fontWeight: 600, color: C.t5, border: `1px dashed ${C.champ}`,
    }}>
      {(p.name || '?').trim()[0]?.toUpperCase()}
    </div>
  );
}

/** Jauge de couverture : rapport entre ce qui reste et ce qu'on vise. */
export function Jauge({ valeur, couleur, largeur = 150, hauteur = 5 }: {
  valeur: number; couleur: string; largeur?: number | string; hauteur?: number;
}) {
  return (
    <div style={{ width: largeur, height: hauteur, borderRadius: hauteur / 2, background: C.ligne, overflow: 'hidden' }}>
      <div style={{
        width: `${Math.max(0, Math.min(100, valeur * 100))}%`, height: '100%',
        borderRadius: hauteur / 2, background: couleur, transition: 'width .2s',
      }} />
    </div>
  );
}

export function CarteFournisseur({ f, actif, onClick }: {
  f: Fournisseur; actif: boolean; onClick: () => void;
}) {
  const derniere = f.last
    ? new Date(f.last).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
    : 'jamais';
  return (
    <button type="button" onClick={onClick} aria-pressed={actif}
            style={{
              flex: '1 1 210px', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
              borderRadius: 10, padding: '12px 14px', background: actif ? `${C.accent}0F` : C.surface,
              border: `1px solid ${actif ? C.accent : C.border}`,
              boxShadow: actif ? `inset 0 0 0 1px ${C.accent}` : 'none',
            }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 30, height: 30, borderRadius: 15, flexShrink: 0, display: 'flex',
          alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700,
          background: actif ? C.accent : `${C.accent}1A`, color: actif ? '#fff' : C.accent,
        }}>{(f.name || '?').trim()[0]?.toUpperCase()}</div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.t1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {f.name}
          </div>
          <div style={{ fontSize: 11, color: C.t4 }}>{f.city || '—'}</div>
        </div>
      </div>
      <div style={{ borderTop: `1px solid ${C.ligne}`, marginTop: 10, paddingTop: 8, fontSize: 11, color: C.t4, lineHeight: 1.6 }}>
        {f.delay} j de délai{f.franco > 0 ? ` · franco ${kr(f.franco)}` : ''}<br />
        {f.refs} référence{f.refs > 1 ? 's' : ''} · dernière commande le {derniere}
      </div>
    </button>
  );
}

/** Ligne de catalogue. La bordure gauche porte l'urgence, ou passe au
 *  vert dès que la ligne est au panier. */
export function LigneCatalogue({ p, semaines, cartons, onAdd }: {
  p: Enrichi; semaines: number; cartons: number; onAdd: () => void;
}) {
  const couleur = URGENCE_COULEUR[p.urgency];
  const auPanier = cartons > 0;
  const rempli = p.cover / Math.max(1, semaines * 7);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      padding: '11px 14px', borderBottom: `1px solid ${C.ligneFaible}`,
      borderLeft: `3px solid ${auPanier ? C.vert : couleur}`,
      background: auPanier ? C.vertFond : 'transparent',
    }}>
      <Vignette p={p} taille={34} />

      <div style={{ flex: '1 1 220px', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}><NomProduit p={p} /></div>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: .3, padding: '1px 7px', borderRadius: 20,
            background: `${couleur}18`, color: couleur, whiteSpace: 'nowrap',
          }}>{URGENCE_LABEL[p.urgency]}</span>
        </div>

        <div style={{ fontSize: 11, color: C.t5, marginTop: 3 }}>
          {p.ref} · carton de {p.packEffectif}
          {p.sek != null ? ` · ${kr(p.sek)} /u.` : p.prix ? ` · ${eur(p.prix)} HT /u.` : ''}
          {p.onOrder > 0 ? ` · ${p.onOrder} en route` : ''}
          {/* Payer 70 % de plus parce qu'on a l'habitude d'un magasin est
              une perte qu'on ne voit jamais : elle est dite ici, au moment
              où la ligne s'ajoute. */}
          {p.surcout >= 8 && (
            <span style={{ color: C.ambre, fontWeight: 600 }}>
              {' · '}+{p.surcout} % vs {p.moinsCherNom || 'ailleurs'}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
          <Jauge valeur={rempli} couleur={couleur} />
          <span style={{ fontSize: 11, color: C.t4 }}>{libelleCouverture(p)}</span>
        </div>
      </div>

      <div style={{ textAlign: 'center', minWidth: 54 }}>
        <div className="sc-num" style={{ fontSize: 15, fontWeight: 700, color: p.stock === 0 ? C.rouge : C.t1 }}>{p.stock}</div>
        <div style={{ fontSize: 8.5, letterSpacing: 1.2, textTransform: 'uppercase', color: C.t5 }}>en stock</div>
      </div>

      <div style={{ textAlign: 'center', minWidth: 62 }}>
        <div className="sc-num" style={{ fontSize: 15, fontWeight: 700, color: C.t1 }}>
          {p.vel > 0 ? `${p.vel.toFixed(1)}` : '—'}
        </div>
        <div style={{ fontSize: 8.5, letterSpacing: 1.2, textTransform: 'uppercase', color: C.t5 }}>u./sem.</div>
      </div>

      <button type="button" onClick={onAdd}
              style={{
                border: 'none', cursor: 'pointer', fontFamily: 'inherit', borderRadius: 7,
                padding: '8px 13px', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
                background: auPanier ? '#E9F0E6' : C.ink, color: auPanier ? C.vert : '#fff',
              }}>
        {auPanier ? 'Encore 1' : `${Math.max(1, p.suggest)} × ${p.packEffectif} u.`}
      </button>
    </div>
  );
}

/** Un point de la liste de contrôle « Avant d'envoyer ». */
export function Controle({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '5px 0' }}>
      <span className="ms" style={{ fontSize: 17, color: ok ? C.vert : C.t6, flexShrink: 0 }}>
        {ok ? 'check_circle' : 'radio_button_unchecked'}
      </span>
      <span style={{ fontSize: 12, color: ok ? C.t3 : C.t1, fontWeight: ok ? 400 : 600, lineHeight: 1.45 }}>
        {children}
      </span>
    </div>
  );
}
