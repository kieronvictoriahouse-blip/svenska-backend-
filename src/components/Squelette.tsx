'use client';
import React from 'react';
import { T } from '@/lib/admin-theme';

/* ═══════════════════════════════════════════════════════════════
   SQUELETTES DE CHARGEMENT

   Au rechargement, le back-office affichait « Chargement… » centré dans
   le vide, puis le tableau apparaissait d'un coup et poussait tout vers
   le bas. Deux défauts en un : rien n'indique ce qui arrive, et la mise
   en page saute une fois les données là.

   Une silhouette de la même forme et de la même hauteur que le contenu
   final règle les deux : on sait ce qu'on attend, et le contenu se pose
   sans rien décaler.

   Les largeurs de cellules varient d'une ligne à l'autre — des barres
   toutes identiques ressemblent à une grille cassée, pas à du texte.
   ═══════════════════════════════════════════════════════════════ */

/** Une barre grise animée. */
export function Barre({ largeur = '100%', hauteur = 11, rond = false, style }: {
  largeur?: number | string; hauteur?: number; rond?: boolean; style?: React.CSSProperties;
}) {
  return (
    <div className={`sc-skel${rond ? ' sc-skel-round' : ''}`}
         style={{ width: largeur, height: hauteur, ...style }} aria-hidden="true" />
  );
}

/* Largeurs pseudo-aléatoires mais stables : un tirage à chaque rendu
   ferait vibrer les barres à chaque frame. */
const LARGEURS = [72, 88, 61, 94, 79, 55, 86, 68, 91, 74, 63, 83];
const largeurDe = (ligne: number, colonne: number, total: number) =>
  `${LARGEURS[(ligne * 3 + colonne * 5) % LARGEURS.length] * (colonne === total - 1 ? 0.6 : 1)}%`;

/**
 * Squelette de tableau.
 *
 * `vignette` réserve la pastille ronde des écrans qui affichent une
 * photo ou des initiales en première colonne — sans elle, la vraie
 * ligne est plus haute que sa silhouette et le tableau saute.
 */
export function SqueletteTable({ lignes = 6, colonnes = 5, vignette = false, entete = true }: {
  lignes?: number; colonnes?: number; vignette?: boolean; entete?: boolean;
}) {
  return (
    <div className="sc-card" style={{ overflow: 'hidden' }} aria-busy="true">
      {entete && (
        <div style={{ display: 'flex', gap: 14, padding: '12px 15px', borderBottom: `1px solid ${T.border}` }}>
          {Array.from({ length: colonnes }).map((_, c) => (
            <div key={c} style={{ flex: c === 0 ? 2 : 1 }}><Barre largeur="52%" hauteur={8} /></div>
          ))}
        </div>
      )}
      {Array.from({ length: lignes }).map((_, l) => (
        <div key={l} style={{
          display: 'flex', alignItems: 'center', gap: 14,
          padding: '13px 15px', borderBottom: `1px solid ${T.borderFaint}`,
        }}>
          {vignette && <Barre largeur={30} hauteur={30} rond style={{ flexShrink: 0 }} />}
          {Array.from({ length: colonnes }).map((_, c) => (
            <div key={c} style={{ flex: c === 0 ? 2 : 1, minWidth: 0 }}>
              <Barre largeur={largeurDe(l, c, colonnes)} />
              {c === 0 && <Barre largeur="45%" hauteur={8} style={{ marginTop: 6 }} />}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Bandeau de compteurs (les cartes KPI en haut des écrans). */
export function SqueletteKpis({ n = 4 }: { n?: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(178px,1fr))', gap: 10, marginBottom: 12 }}
         aria-busy="true">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="sc-card" style={{ padding: '13px 15px' }}>
          <Barre largeur="58%" hauteur={8} />
          <Barre largeur="42%" hauteur={20} style={{ marginTop: 10 }} />
        </div>
      ))}
    </div>
  );
}

/** Grille de cartes (produits, médias, catégories). */
export function SqueletteCartes({ n = 8, hauteurImage = 120 }: { n?: number; hauteurImage?: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(190px,1fr))', gap: 12 }}
         aria-busy="true">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="sc-card" style={{ overflow: 'hidden' }}>
          <Barre largeur="100%" hauteur={hauteurImage} style={{ borderRadius: 0 }} />
          <div style={{ padding: '11px 13px' }}>
            <Barre largeur="82%" />
            <Barre largeur="54%" hauteur={9} style={{ marginTop: 7 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Panneau de détail (colonne de droite des écrans à deux volets). */
export function SqueletteDetail({ blocs = 3 }: { blocs?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }} aria-busy="true">
      {Array.from({ length: blocs }).map((_, i) => (
        <div key={i} className="sc-card" style={{ padding: '14px 16px' }}>
          <Barre largeur="38%" hauteur={9} />
          <Barre largeur="92%" style={{ marginTop: 12 }} />
          <Barre largeur="78%" style={{ marginTop: 8 }} />
          <Barre largeur="64%" style={{ marginTop: 8 }} />
        </div>
      ))}
    </div>
  );
}
