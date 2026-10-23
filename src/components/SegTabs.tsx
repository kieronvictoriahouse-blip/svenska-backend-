'use client';
import { T } from '@/lib/admin-theme';

/* ═══════════════════════════════════════════════════════════════
   ONGLETS D'ÉCRAN SUR TÉLÉPHONE
   Tous les onglets visibles d'un coup (icône + libellé court, 56 px
   de haut) : sur une rangée qui défile, les derniers onglets d'un
   écran (« Livres & export », « Paramètres »…) passaient hors champ.
   Rendu dans un .sc-only-mobile : sur ordinateur, l'écran garde sa
   rangée d'onglets soulignés.
   Utilisé par Comptabilité, Facturation, White label et Pages.
   ═══════════════════════════════════════════════════════════════ */

export type SegTab<K extends string> = { key: K; label: string; icon: string; badge?: number; title?: string };

export default function SegTabs<K extends string>({ tabs, value, onChange, label }: {
  tabs: SegTab<K>[]; value: K; onChange: (k: K) => void; label?: string;
}) {
  return (
    <div role="tablist" aria-label={label}
         style={{ display: 'grid', gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))`, gap: 3, padding: 3,
                  background: T.borderFaint2, border: `1px solid ${T.border}`, borderRadius: 11 }}>
      {tabs.map(t => {
        const on = t.key === value;
        return (
          <button key={t.key} type="button" role="tab" aria-selected={on} title={t.title || t.label} onClick={() => onChange(t.key)}
            style={{
              position: 'relative', minHeight: 56, border: 'none', borderRadius: 8, cursor: 'pointer', padding: '6px 2px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, minWidth: 0,
              background: on ? T.surface : 'transparent', boxShadow: on ? '0 1px 3px rgba(21,24,30,.12)' : 'none',
              color: on ? 'var(--accent)' : T.text2, fontWeight: on ? 600 : 500,
            }}>
            <span className="ms" style={{ fontSize: 21, fontVariationSettings: on ? "'wght' 500, 'FILL' 1" : "'wght' 300" }}>{t.icon}</span>
            <span style={{ fontSize: 12, lineHeight: 1.15, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.label}</span>
            {!!t.badge && (
              <span style={{ position: 'absolute', top: 4, left: 'calc(50% + 6px)', minWidth: 18, height: 18, borderRadius: 9, padding: '0 5px',
                             background: on ? 'var(--accent)' : T.muted, color: '#fff', fontSize: 11, fontWeight: 700,
                             display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{t.badge}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Plancher de 12 px pour les petits textes posés en style en ligne
 *  (9,5 px, 10,5 px, 11 px…) sous `root`, sur téléphone seulement. Un
 *  style en ligne ne connaît pas les media queries : on le rattrape par
 *  sa valeur sérialisée par React (« font-size: 11px »). */
export function minTextCss(root: string): string {
  const sizes = ['9px', '9.5px', '10px', '10.5px', '11px', '11.5px'];
  return `@media (max-width: 899px) { ${sizes.map(s => `${root} [style*="font-size: ${s}"]`).join(', ')} { font-size: 12px !important; } }`;
}
