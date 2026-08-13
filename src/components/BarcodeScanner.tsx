'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { T } from '@/lib/admin-theme';

/* ═══════════════════════════════════════════════════════════════
   VISEUR DE SCAN CODE-BARRES — composant partagé
   Handoff « scan & saisie ticket », §2 : bloc sombre, coins,
   ligne de balayage animée, bouton 44 px.

   Détection : BarcodeDetector natif (Chrome Android) ; à défaut la
   caméra reste utilisable et la saisie manuelle prend le relais.
   L'accès caméra exige HTTPS — en local, seul localhost est autorisé.

   ⚠️ Deux garde-fous imposés par le handoff :
   · anti-rebond de 700 ms sur un même code lu en continu ;
   · c'est l'appelant qui déduplique (mise à jour fonctionnelle),
     ce composant se contente d'émettre un code.
   ═══════════════════════════════════════════════════════════════ */

const DEBOUNCE_MS = 700;

export type ScannerProps = {
  onScan: (code: string) => void;
  /** Hauteur réduite pour la session d'inventaire. */
  compact?: boolean;
  label?: string;
  /** Bouton de simulation, utile hors mobile et pour tester le flux. */
  onSimulate?: () => void;
};

export default function BarcodeScanner({ onScan, compact = false, label = 'Vise le code-barres', onSimulate }: ScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastRef = useRef<{ code: string; at: number }>({ code: '', at: 0 });
  const rafRef = useRef<number | null>(null);

  const [active, setActive] = useState(false);
  const [error, setError] = useState('');
  const [supported, setSupported] = useState<boolean | null>(null);
  const [manual, setManual] = useState('');

  useEffect(() => {
    setSupported(typeof window !== 'undefined' && 'BarcodeDetector' in window);
  }, []);

  /** Émet le code en respectant l'anti-rebond. */
  const emit = useCallback((code: string) => {
    const now = Date.now();
    if (lastRef.current.code === code && now - lastRef.current.at < DEBOUNCE_MS) return;
    lastRef.current = { code, at: now };
    try { navigator.vibrate?.(60); } catch { /* non supporté */ }
    onScan(code);
  }, [onScan]);

  const stop = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setActive(false);
  }, []);

  const start = useCallback(async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setActive(true);

      const Detector = (window as any).BarcodeDetector;
      if (!Detector) return; // caméra allumée, lecture manuelle

      const detector = new Detector({
        formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'],
      });

      const tick = async () => {
        if (!videoRef.current || !streamRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes?.length) emit(String(codes[0].rawValue || '').trim());
        } catch { /* frame illisible, on continue */ }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (e: any) {
      setError(
        e?.name === 'NotAllowedError' ? 'Accès caméra refusé.'
        : e?.name === 'NotFoundError' ? 'Aucune caméra détectée.'
        : location.protocol !== 'https:' && location.hostname !== 'localhost'
          ? 'La caméra exige une connexion HTTPS.'
          : 'Caméra indisponible.'
      );
    }
  }, [emit]);

  useEffect(() => () => stop(), [stop]);

  const camH = compact ? '4 / 3' : '16 / 10';

  return (
    <div style={{ background: '#15181E', borderRadius: 12, padding: 12 }}>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes scanline { 0% { top: 24%; } 50% { top: 72%; } 100% { top: 24%; } }
      ` }} />

      <div style={{
        position: 'relative', aspectRatio: camH, background: '#0E1116',
        borderRadius: 9, overflow: 'hidden',
      }}>
        <video ref={videoRef} playsInline muted
               style={{ width: '100%', height: '100%', objectFit: 'cover', display: active ? 'block' : 'none' }} />

        {/* Texture de balayage */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'repeating-linear-gradient(180deg, rgba(255,255,255,.035) 0 2px, transparent 2px 5px)',
        }} />

        {/* Quatre coins */}
        {[
          { top: '9%',  left: '22%',  bt: true,  bl: true  },
          { top: '9%',  right: '22%', bt: true,  br: true  },
          { bottom: '9%', left: '22%',  bb: true, bl: true  },
          { bottom: '9%', right: '22%', bb: true, br: true  },
        ].map((c, i) => (
          <div key={i} style={{
            position: 'absolute', width: 26, height: 26, pointerEvents: 'none',
            top: (c as any).top, bottom: (c as any).bottom, left: (c as any).left, right: (c as any).right,
            borderTop:    (c as any).bt ? '2px solid rgba(255,255,255,.7)' : undefined,
            borderBottom: (c as any).bb ? '2px solid rgba(255,255,255,.7)' : undefined,
            borderLeft:   (c as any).bl ? '2px solid rgba(255,255,255,.7)' : undefined,
            borderRight:  (c as any).br ? '2px solid rgba(255,255,255,.7)' : undefined,
            borderTopLeftRadius:     (c as any).bt && (c as any).bl ? 8 : undefined,
            borderTopRightRadius:    (c as any).bt && (c as any).br ? 8 : undefined,
            borderBottomLeftRadius:  (c as any).bb && (c as any).bl ? 8 : undefined,
            borderBottomRightRadius: (c as any).bb && (c as any).br ? 8 : undefined,
          }} />
        ))}

        {/* Ligne de scan animée */}
        <div style={{
          position: 'absolute', left: '12%', right: '12%', height: 2,
          background: 'var(--accent)', boxShadow: '0 0 16px 2px rgba(123,79,123,.9)',
          animation: 'scanline 2.6s ease-in-out infinite', pointerEvents: 'none',
        }} />

        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 10, textAlign: 'center',
          fontSize: 11.5, color: 'rgba(255,255,255,.45)', pointerEvents: 'none',
        }}>{error || label}</div>
      </div>

      <button
        onClick={active ? stop : start}
        style={{
          width: '100%', height: 44, marginTop: 10, borderRadius: 9, border: 'none',
          background: '#F4EEE1', color: '#15181E', fontSize: 13.5, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer',
        }}>
        <span className="ms" style={{ fontSize: 20 }}>barcode_scanner</span>
        {active ? 'Arrêter la caméra' : 'Activer la caméra'}
      </button>

      {/* Saisie manuelle : filet de sécurité quand la détection native
          n'existe pas (iOS/Safari) ou que le code est abîmé. */}
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <input
          value={manual}
          onChange={e => setManual(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && manual.trim()) { emit(manual.trim()); setManual(''); } }}
          placeholder="ou saisir l'EAN…"
          inputMode="numeric"
          style={{
            flex: 1, height: 34, borderRadius: 7, border: '1px solid rgba(255,255,255,.16)',
            background: 'rgba(255,255,255,.06)', color: '#fff', padding: '0 10px',
            fontSize: 12.5, outline: 'none', fontVariantNumeric: 'tabular-nums',
          }} />
        <button
          onClick={() => { if (manual.trim()) { emit(manual.trim()); setManual(''); } }}
          style={{
            height: 34, padding: '0 12px', borderRadius: 7, border: '1px solid rgba(255,255,255,.16)',
            background: 'transparent', color: '#F4EEE1', fontSize: 12.5, cursor: 'pointer',
          }}>OK</button>
        {onSimulate && (
          <button onClick={onSimulate}
            style={{
              height: 34, padding: '0 12px', borderRadius: 7, border: '1px solid rgba(255,255,255,.16)',
              background: 'transparent', color: 'rgba(244,238,225,.7)', fontSize: 12.5, cursor: 'pointer',
            }}>Simuler</button>
        )}
      </div>

      {supported === false && (
        <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,.4)', marginTop: 7, lineHeight: 1.5 }}>
          Ce navigateur ne lit pas les codes-barres nativement (c’est le cas d’iOS).
          La caméra sert de repère, saisis le code au clavier — ou utilise Chrome sur Android.
        </div>
      )}
    </div>
  );
}
