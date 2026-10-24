'use client';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';

/* ═══════════════════════════════════════════════════════════════
   APERÇU D'UN EMAIL HTML — ajusté à la largeur disponible

   Un email est composé pour ~600 px. Sur un téléphone de 360-390 px,
   l'iframe coupait le message à droite (ou le faisait défiler de côté
   dans un cadre de hauteur fixe). Avec `ajuster`, on mesure la largeur
   naturelle du contenu et on le réduit à l'échelle, comme une
   application mail ; la hauteur suit le contenu et c'est la page qui
   défile, pas un cadre dans la page.

   Sans `ajuster` (ordinateur), l'iframe est rendue exactement comme
   avant, avec le style fourni.

   La mesure lit le document de l'iframe : elle exige le même origine.
   ⚠ HTML REÇU (boîte mail) : `allow-same-origin` sans `allow-scripts`
   bloque bien les scripts, MAIS les images, fonds CSS, @import et <link>
   du message partent alors depuis l'origine de l'admin, cookie de
   session compris — un email piégé pouvait appeler /api/* rien qu'en
   s'affichant. Tout HTML tiers passe donc d'abord par neutraliserHtml
   (boite-mail/ui.tsx) ; sans ça, garder `sandbox=""` (origine opaque,
   aucun cookie) et renoncer à l'ajustement.
   Utilisé par : boîte mail, relances, emails, éditeur de campagne.
   ═══════════════════════════════════════════════════════════════ */

export default function EmailApercu(p: {
  html: string;
  title: string;
  /** Réduire à la largeur du conteneur (téléphone). */
  ajuster: boolean;
  /** Attribut sandbox de l'iframe ; absent = pas de sandbox. */
  sandbox?: string;
  /** Style de l'iframe quand elle n'est pas ajustée. */
  style?: CSSProperties;
  /** Fond derrière l'email quand il est ajusté. */
  fond?: string;
}) {
  const boite = useRef<HTMLDivElement>(null);
  const cadre = useRef<HTMLIFrameElement>(null);
  const derniereLargeur = useRef(0);
  const [dim, setDim] = useState<{ w: number; h: number; s: number } | null>(null);

  const mesurer = useCallback(() => {
    const f = cadre.current, b = boite.current;
    let doc: Document | null = null;
    try { doc = f?.contentDocument || null; } catch { doc = null; }
    // Pas le document vide initial : seulement le HTML de l'email (about:srcdoc).
    if (!f || !b || !doc || !doc.documentElement || doc.URL !== 'about:srcdoc' || doc.readyState === 'loading') return;
    const dispo = b.clientWidth;
    if (!dispo) return;
    derniereLargeur.current = dispo;
    // 1. À la largeur disponible, quelle largeur le contenu réclame-t-il ?
    f.style.transform = 'none';
    f.style.width = `${dispo}px`;
    f.style.height = '1px';
    const large = Math.max(dispo, doc.documentElement.scrollWidth, doc.body?.scrollWidth || 0);
    // 2. À cette largeur, quelle hauteur ?
    f.style.width = `${large}px`;
    const haut = Math.max(doc.documentElement.scrollHeight, doc.body?.scrollHeight || 0, 40);
    const s = dispo / large;
    f.style.height = `${haut}px`;
    if (s < 1) f.style.transform = `scale(${s})`;
    setDim(d => (d && d.w === large && d.h === haut ? d : { w: large, h: haut, s }));
  }, []);

  /* L'évènement load attend toutes les images de l'email (parfois des
     secondes) : on mesure aussi pendant le chargement, pour ne pas laisser
     le message dans un cadre de 320 px en attendant. */
  useEffect(() => {
    if (!p.ajuster) return;
    let n = 0;
    const id = window.setInterval(() => { mesurer(); if (++n >= 16) window.clearInterval(id); }, 250);
    return () => window.clearInterval(id);
  }, [p.html, p.ajuster, mesurer]);

  // Rotation du téléphone, ouverture d'un panneau : la largeur change, on remesure.
  useEffect(() => {
    if (!p.ajuster || !boite.current || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const l = boite.current?.clientWidth || 0;
      if (l && Math.abs(l - derniereLargeur.current) > 1) mesurer();
    });
    ro.observe(boite.current);
    return () => ro.disconnect();
  }, [p.ajuster, mesurer]);

  if (!p.ajuster) {
    return <iframe srcDoc={p.html} title={p.title} sandbox={p.sandbox} style={p.style} />;
  }

  return (
    <div ref={boite} style={{
      width: '100%', overflow: 'hidden', background: p.fond || '#fff',
      height: dim ? Math.ceil(dim.h * Math.min(1, dim.s)) : 320,
    }}>
      <iframe ref={cadre} srcDoc={p.html} title={p.title} sandbox={p.sandbox}
              scrolling="no" onLoad={mesurer}
              style={{
                display: 'block', border: 'none', background: p.fond || '#fff',
                width: dim ? dim.w : '100%', height: dim ? dim.h : 320,
                transform: dim && dim.s < 1 ? `scale(${dim.s})` : undefined,
                transformOrigin: '0 0',
              }} />
    </div>
  );
}
