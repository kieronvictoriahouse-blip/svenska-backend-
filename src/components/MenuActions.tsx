'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';

/* ═══════════════════════════════════════════════════════════════
   MENU D'ACTIONS « ⋯ »

   Liste déroulante accrochée à son bouton sur ordinateur, feuille
   qui monte du bas de l'écran sur téléphone (classes .sc-menu* de
   shell-css.ts : le basculement est en CSS, rien ne clignote).

   Sert à ranger les actions secondaires d'un écran sans en
   supprimer aucune : sur téléphone, une rangée de quatre boutons
   devient un bouton principal + ce menu.

   <MenuActions open={o} anchor={btnRef.current} onClose={() => setO(false)} title="…">
     <MenuItem icon="edit" label="Modifier" href="/admin/…" />
     <MenuItem icon="delete" label="Supprimer" danger onClick={…} />
   </MenuActions>
   ═══════════════════════════════════════════════════════════════ */

export function MenuActions({ open, anchor, onClose, title, align = 'right', children }: {
  open: boolean;
  /** Élément auquel accrocher la liste sur ordinateur. */
  anchor?: HTMLElement | null;
  onClose: () => void;
  /** Ligne d'en-tête discrète (nom du produit, adresse email…). */
  title?: React.ReactNode;
  align?: 'left' | 'right';
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<React.CSSProperties>({});

  useLayoutEffect(() => {
    if (!open) return;
    const r = anchor?.getBoundingClientRect();
    if (!r) { setPos({ top: 60, right: 12 }); return; }
    const top = Math.round(r.bottom + 6);
    setPos(align === 'right'
      ? { top, right: Math.max(8, Math.round(window.innerWidth - r.right)) }
      : { top, left: Math.max(8, Math.round(r.left)) });
  }, [open, anchor, align]);

  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current(); };
    window.addEventListener('keydown', onKey);
    ref.current?.focus({ preventScroll: true });
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  /* Liste trop basse pour l'écran (bouton en bas de page) : on la
     remonte au-dessus de son bouton plutôt que de la couper. */
  useLayoutEffect(() => {
    if (!open || !ref.current || !anchor) return;
    const m = ref.current.getBoundingClientRect();
    const r = anchor.getBoundingClientRect();
    if (window.innerWidth >= 900 && m.bottom > window.innerHeight - 8 && r.top - m.height - 6 > 8) {
      setPos(p => ({ ...p, top: Math.round(r.top - m.height - 6) }));
    }
  }, [open, anchor, pos.top]);

  if (!open) return null;
  return (
    <>
      <button type="button" className="sc-menu-back" aria-label="Fermer le menu" onClick={onClose} />
      <div ref={ref} className="sc-menu" role="menu" tabIndex={-1} style={pos}
           onClick={e => { if ((e.target as HTMLElement).closest('[data-menu-close]')) onClose(); }}>
        <div className="sc-menu-grab" aria-hidden="true" />
        {title && <div className="sc-menu-title">{title}</div>}
        {children}
      </div>
    </>
  );
}

/** Une ligne du menu : lien interne, lien externe ou bouton. Ferme le menu
 *  après le clic, sauf `keepOpen` (étape de confirmation, bascule…). */
export function MenuItem({ icon, label, href, external, onClick, danger, disabled, keepOpen, hint }: {
  icon?: string; label: React.ReactNode; href?: string; external?: boolean;
  onClick?: () => void; danger?: boolean; disabled?: boolean; keepOpen?: boolean; hint?: React.ReactNode;
}) {
  const cls = `sc-menu-item${danger ? ' danger' : ''}`;
  const close = keepOpen ? {} : { 'data-menu-close': '' };
  const inner = (
    <>
      {icon && <span className="ms">{icon}</span>}
      <span style={{ flex: 1, minWidth: 0 }}>
        {label}
        {hint && <span style={{ display: 'block', fontSize: '0.8em', opacity: .7, marginTop: 1 }}>{hint}</span>}
      </span>
    </>
  );
  if (href && external) return <a role="menuitem" className={cls} href={href} target="_blank" rel="noopener" {...close}>{inner}</a>;
  if (href) return <Link role="menuitem" className={cls} href={href} {...close}>{inner}</Link>;
  return <button role="menuitem" type="button" className={cls} onClick={onClick} disabled={disabled} {...close}>{inner}</button>;
}

export function MenuSep() {
  return <div className="sc-menu-sep" role="separator" />;
}
