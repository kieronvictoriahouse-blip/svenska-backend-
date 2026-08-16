'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { T } from '@/lib/admin-theme';

/* ═══════════════════════════════════════════════════════════════
   VISEUR DE SCAN CODE-BARRES — composant partagé
   Handoff « scan & saisie ticket », §2 : bloc sombre, coins,
   ligne de balayage animée, bouton 44 px.

   Lecture : ZXing, qui tourne dans tous les navigateurs — iPhone
   compris, ou BarcodeDetector n'existe pas et ou le scan ne
   fonctionnait donc jamais. La saisie au clavier reste disponible
   pour un code abime.
   L'acces camera exige HTTPS — en local, seul localhost est autorise.

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
const INTERVALLE_MS = 90;

/* Formats qui portent une cle de controle. Un CODE-128 ou un QR peut
   contenir 13 chiffres sans etre un EAN : lui appliquer la cle le
   rejetterait a tort. C'est ce que faisait la version precedente. */
const AVEC_CLE = new Set(['ean_13', 'ean_8', 'upc_a', 'upc_e']);

/** Cle de controle EAN-13 / EAN-8 / UPC-A. Un code mal lu la rate. */
function cleValide(code: string): boolean {
  if (!/^\d+$/.test(code)) return true;
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
  const readerRef = useRef<any>(null);
  const controlsRef = useRef<any>(null);

  const [torche, setTorche] = useState(false);
  const [torcheDispo, setTorcheDispo] = useState(false);

  const [active, setActive] = useState(false);
  const [error, setError] = useState('');
  const [supported, setSupported] = useState<boolean | null>(null);
  const [manual, setManual] = useState('');

  useEffect(() => {
    /* La lecture ne depend plus du navigateur : ZXing tourne partout,
       iPhone compris. Seule la camera peut manquer. */
    setSupported(typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia);
  }, []);

  /**
   * Émet un code lu.
   *
   * Deux filtres avant d'accepter, parce qu'un code faux coûte plus cher
   * qu'un code manqué : il entre en stock ou part sur une commande.
   *   1. la clé de contrôle EAN doit tomber juste ;
   *   2. le même code doit être lu deux fois de suite.
   */
  const emit = useCallback((code: string, format?: string, saisi = false) => {
    if (!code) return;

    /* Saisie au clavier : c'est un humain qui a tape, il n'y a rien a
       confirmer. Sans cette sortie, il fallait valider deux fois. */
    if (saisi) {
      lastRef.current = { code, at: Date.now() };
      candidatRef.current = { code: '', vu: 0 };
      onScan(code);
      return;
    }

    /* Un format a cle de controle se valide en une seule lecture : la
       cle EST la confirmation. Exiger deux lectures identiques par
       dessus, comme le faisait la version precedente, faisait rater la
       plupart des scans sans rien apporter. */
    const aUneCle = !!format && AVEC_CLE.has(format);
    if (aUneCle) {
      if (!cleValide(code)) { candidatRef.current = { code: '', vu: 0 }; return; }
    } else {
      // Sans cle (QR, CODE-128, ITF), on confirme par une seconde lecture.
      const c = candidatRef.current;
      if (c.code === code) c.vu += 1;
      else candidatRef.current = { code, vu: 1 };
      if (candidatRef.current.vu < CONFIRMATIONS) return;
    }

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
    try { controlsRef.current?.stop?.(); } catch { /* deja arrete */ }
    controlsRef.current = null;
    readerRef.current = null;
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
          /* 1280x720 plutot que 1080p : au-dela, chaque appel au detecteur
             coute plus cher et on lit MOINS de codes par seconde. La
             version precedente demandait 1920 et scannait moins bien. */
          width: { ideal: 1280 }, height: { ideal: 720 },
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

      /* ── Moteur de lecture ────────────────────────────────────
         ZXing est le moteur principal, pas un repli : BarcodeDetector
         lit mal les EAN sur etiquette imprimee, et n'existe pas du tout
         sur iPhone — ou le scan ne fonctionnait donc jamais.

         ZXing tourne partout, gere le flou et les codes de travers, et
         reste sur son propre rythme. On lui laisse le flux deja ouvert
         pour conserver nos contraintes de camera et la lampe. */
      const { BrowserMultiFormatReader } = await import('@zxing/browser');
      const { DecodeHintType, BarcodeFormat } = await import('@zxing/library');

      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13, BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
        BarcodeFormat.CODE_128, BarcodeFormat.CODE_39,
        BarcodeFormat.ITF, BarcodeFormat.QR_CODE, BarcodeFormat.DATA_MATRIX,
      ]);
      // Analyse plus poussee de chaque image : on prefere le temps de
      // calcul au code manque, on est sur un geste ponctuel.
      hints.set(DecodeHintType.TRY_HARDER, true);

      const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: INTERVALLE_MS });
      readerRef.current = reader;

      const FORMATS: Record<number, string> = {
        [BarcodeFormat.EAN_13]: 'ean_13', [BarcodeFormat.EAN_8]: 'ean_8',
        [BarcodeFormat.UPC_A]: 'upc_a', [BarcodeFormat.UPC_E]: 'upc_e',
      };

      controlsRef.current = await reader.decodeFromVideoElement(videoRef.current!, (result) => {
        if (!result) return;                       // image sans code, on continue
        const texte = String(result.getText() || '').trim();
        emit(texte, FORMATS[result.getBarcodeFormat() as number]);
      });

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
          onKeyDown={e => { if (e.key === 'Enter' && manual.trim()) { emit(manual.trim(), undefined, true); setManual(''); } }}
          placeholder="ou saisir l'EAN…"
          inputMode="numeric"
          style={{
            flex: 1, height: 34, borderRadius: 7, border: '1px solid rgba(255,255,255,.16)',
            background: 'rgba(255,255,255,.06)', color: '#fff', padding: '0 10px',
            fontSize: 12.5, outline: 'none', fontVariantNumeric: 'tabular-nums',
          }} />
        <button
          onClick={() => { if (manual.trim()) { emit(manual.trim(), undefined, true); setManual(''); } }}
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
          Ce navigateur ne donne pas accès à la caméra. Saisis le code au clavier,
          ou ouvre le back-office depuis un téléphone.
        </div>
      )}
    </div>
  );
}
