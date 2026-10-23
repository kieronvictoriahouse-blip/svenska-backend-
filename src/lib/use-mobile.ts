'use client';
import { useEffect, useState } from 'react';

/** Seuil mobile du back-office : le même que le shell (layout.tsx). */
export const MOBILE_BP = 900;

/** Vrai sous 900 px de large. À réserver aux changements de STRUCTURE
 *  (afficher des cartes au lieu d'un tableau, une fenêtre plein écran…) :
 *  le simple style passe par les classes de shell-css.ts. Faux au premier
 *  rendu (rendu serveur), puis mis à jour sur le client. */
export function useIsMobile(bp: number = MOBILE_BP): boolean {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${bp - 1}px)`);
    const on = () => setMobile(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [bp]);
  return mobile;
}
