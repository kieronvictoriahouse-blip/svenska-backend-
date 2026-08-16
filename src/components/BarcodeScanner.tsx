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

/* Deux lectures identiques consecutives avant d'accepter. Une lecture
   isolee sur une image floue est la premiere source de code faux. */
const CONFIRMATIONS = 2;

/* Cadence de detection. Analyser chaque image ne sert a rien : le
   detecteur est plus lent que l'affichage, et on empile les appels. */
const INTERVALLE_MS = 120;

/** Cle de controle EAN-13 / EAN-8 / UPC-A. Un code mal lu la rate. */
function cleValide(code: string): boolean {
  if (!/^\d+$/.test(code)) return true;              // pas un EAN : rien a verifier
  if (![8, 12, 13, 14].includes(code.length)) return true;
  const chiffres = code.split('').map(Number);
  const cle = chiffres.pop() as number;
  // Le poids 3 s'applique en partant de la droite, quelle que soit la longueur.
  const somme = chiffres.reverse().reduce((s, d, i) => s + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (somme % 10)) % 10 === cle;
}

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
  const timerRef = useRef<any>(null);
  const candidatRef = useRef<{ code: string; vu: number }>({ code: '', vu: 0 });
  const trackRef = useRef<MediaStreamTrack | null>(null);

  const [torche, setTorche] = useState(false);
  const [torcheDispo, setTorcheDispo] = useState(false);

  const [active, setActive] = useState(false);
  const [error, setError] = useState('');
  const [supported, setSupported] = useState<boolean | null>(null);
  const [manual, setManual] = useState('');

  useEffect(() => {
    setSupported(typeof window !== 'undefined' && 'BarcodeDetector' in window);
  }, []);

  /**
   * Émet un code lu.
   *
   * Deux filtres avant d'accepter, parce qu'un code faux coûte plus cher
   * qu'un code manqué : il entre en stock ou part sur une commande.
   *   1. la clé de contrôle EAN doit tomber juste ;
   *   2. le même code doit être lu deux fois de suite.
   */
  const emit = useCallback((code: string) => {
    if (!code) return;
    if (!cleValide(code)) { candidatRef.current = { code: '', vu: 0 }; return; }

    const c = candidatRef.current;
    if (c.code === code) c.vu += 1;
    else candidatRef.current = { code, vu: 1 };
    if (candidatRef.current.vu < CONFIRMATIONS) return;

    const now = Date.now();
    if (lastRef.current.code === code && now - lastRef.current.at < DEBOUNCE_MS) return;
    lastRef.current = { code, at: now };
    candidatRef.current = { code: '', vu: 0 };
    try { navigator.vibrate?.(60); } catch { /* non supporté */ }
    onScan(code);
  }, [onScan]);

  /** Éclairage : indispensable sur une étiquette mate en réserve. */
  const basculerTorche = useCallback(async () => {
    const track = trackRef.current;
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torche } as any] });
      setTorche(t => !t);
    } catch { /* la lampe n'est pas pilotable sur cet appareil */ }
  }, [torche]);

  const stop = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    candidatRef.current = { code: '', vu: 0 };
    trackRef.current = null;
    setTorche(false); setTorcheDispo(false);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setActive(false);
  }, []);

  const start = useCallback(async () => {
    setError('');
    try {
      /* Contraintes qui font toute la difference sur un code-barres :
         une definition suffisante pour resoudre des barres fines, et
         l'autofocus continu — sans lui l'image reste floue de pres, ce
         qui produit soit rien, soit un code faux. */
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 }, height: { ideal: 1080 },
          // Non standard mais honore par Chrome Android, ignore ailleurs.
          advanced: [{ focusMode: 'continuous' } as any],
        },
      });
      streamRef.current = stream;

      const track = stream.getVideoTracks()[0];
      trackRef.current = track || null;
      try {
        const caps: any = track?.getCapabilities?.() || {};
        setTorcheDispo(!!caps.torch);
        if (caps.focusMode?.includes?.('continuous')) {
          await track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as any] });
        }
      } catch { /* capacites non exposees */ }
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setActive(true);

      const Detector = (window as any).BarcodeDetector;
      if (!Detector) return; // caméra allumée, lecture manuelle

      /* On demande au detecteur ce qu'il sait vraiment lire : declarer un
         format non supporte fait echouer la construction entiere. */
      let formats = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code', 'data_matrix'];
      try {
        const dispo: string[] = await Detector.getSupportedFormats();
        if (dispo?.length) formats = formats.filter(f => dispo.includes(f));
      } catch { /* methode absente : on garde la liste par defaut */ }

      const detector = new Detector({ formats });

      /* Cadence fixe plutot qu'a chaque image : le detecteur est plus
         lent que l'affichage, et empiler les appels degrade la lecture
         au lieu de l'ameliorer. */
      let enCours = false;
      timerRef.current = setInterval(async () => {
        if (enCours || !videoRef.current || !streamRef.current) return;
        if (videoRef.current.readyState < 2) return;      // image pas encore prete
        enCours = true;
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes?.length) {
            /* Le plus grand code de l'image : c'est celui qu'on vise,
               les autres sont des voisins sur l'etiquette. */
            const plusGrand = codes.reduce((a: any, b: any) =>
              ((b.boundingBox?.width || 0) > (a.boundingBox?.width || 0) ? b : a));
            emit(String(plusGrand.rawValue || '').trim());
          }
        } catch { /* image illisible, on continue */ }
        finally { enCours = false; }
      }, INTERVALLE_MS);
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

      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button
          onClick={active ? stop : start}
          style={{
            flex: 1, height: 44, borderRadius: 9, border: 'none',
            background: '#F4EEE1', color: '#15181E', fontSize: 13.5, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer',
          }}>
          <span className="ms" style={{ fontSize: 20 }}>barcode_scanner</span>
          {active ? 'Arrêter la caméra' : 'Activer la caméra'}
        </button>

        {/* La lampe change tout sur une étiquette mate en réserve ; le
            bouton n'apparaît que si l'appareil sait la piloter. */}
        {active && torcheDispo && (
          <button onClick={basculerTorche} aria-label="Éclairage"
                  style={{
                    width: 52, height: 44, borderRadius: 9, cursor: 'pointer',
                    border: '1px solid rgba(255,255,255,.16)',
                    background: torche ? '#F4EEE1' : 'transparent',
                    color: torche ? '#15181E' : 'rgba(255,255,255,.85)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
            <span className="ms" style={{ fontSize: 21 }}>{torche ? 'flashlight_on' : 'flashlight_off'}</span>
          </button>
        )}
      </div>

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
