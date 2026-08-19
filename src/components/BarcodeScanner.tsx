'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { T } from '@/lib/admin-theme';

/* ═══════════════════════════════════════════════════════════════
   VISEUR DE SCAN CODE-BARRES — composant partagé
   Handoff « scan & saisie ticket », §2 : bloc sombre, coins,
   ligne de balayage animée, bouton 44 px.

   ── Moteur de lecture ────────────────────────────────────────────
   zxing-cpp, compilé en WebAssembly (paquet `zxing-wasm`). C'est le
   portage C++ de ZXing, développé bien au-delà de l'original Java :
   meilleure détection, nettement plus rapide, et surtout ENTRETENU.
   La version précédente s'appuyait sur `@zxing/browser` / `zxing-js`,
   dont le développement est arrêté — le décodage y était mou et ratait
   des EAN parfaitement nets.

   Voie rapide : `BarcodeDetector`, l'API native de Chrome/Android,
   accélérée matériellement. Quand elle est là, elle passe devant.
   Repli automatique : elle est réputée faible sur les EAN imprimés, et
   elle n'existe pas du tout sur iPhone. Si elle ne rend rien pendant
   BASCULE_MS, on passe définitivement au WASM pour la session. Le
   moteur réellement en service est affiché dans le diagnostic — on ne
   devine pas, on lit.

   Le binaire est servi par notre domaine (public/zxing_reader.wasm,
   recopié au build par scripts/copier-wasm.js). Dépendre d'un CDN pour
   scanner au fond d'une réserve serait une fragilité gratuite.

   L'accès caméra exige HTTPS — en local, seul localhost est autorisé.
   La saisie au clavier reste disponible pour un code abîmé.

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

/* Duree sans aucune lecture au-dela de laquelle on abandonne le
   detecteur natif pour le WASM. Assez long pour laisser le temps de
   viser, assez court pour ne pas s'acharner. */
const BASCULE_MS = 2500;

/* Formats qui portent une cle de controle. Un CODE-128 ou un QR peut
   contenir 13 chiffres sans etre un EAN : lui appliquer la cle le
   rejetterait a tort. C'est ce que faisait une version precedente.

   Les deux moteurs ne nomment pas les formats pareil : zxing-cpp rend
   « EAN13 », l'API native rend « ean_13 ». Les deux jeux sont ici. */
const AVEC_CLE = new Set([
  'EAN13', 'EAN8', 'UPCA', 'UPCE',              // zxing-cpp
  'ean_13', 'ean_8', 'upc_a', 'upc_e',          // BarcodeDetector
]);

/* Ce qu'on cherche. Restreindre la liste accelere la detection et
   supprime des faux positifs : un DataBar lu de travers ne viendra pas
   se faire passer pour un EAN. */
const FORMATS_WASM = [
  'EAN13', 'EAN8', 'UPCA', 'UPCE',
  'Code128', 'Code39', 'ITF',
  'QRCode', 'DataMatrix',
] as const;

const FORMATS_NATIF = [
  'ean_13', 'ean_8', 'upc_a', 'upc_e',
  'code_128', 'code_39', 'itf',
  'qr_code', 'data_matrix',
];

/* Fenetre analysee dans l'image, en proportion. On ne decode pas tout
   le cadre : moins de pixels a traiter, donc plus de tentatives par
   seconde, et aucun risque de lire l'etiquette du carton d'a cote.
   La bande est large — un EAN est bien plus large que haut. */
const ZONE = { x: 0.04, y: 0.20, w: 0.92, h: 0.60 };

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
  const timerRef = useRef<any>(null);
  const candidatRef = useRef<{ code: string; vu: number }>({ code: '', vu: 0 });
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const vivantRef = useRef(false);
  const natifRef = useRef<any>(null);
  const depuisRef = useRef(0);                 // début de la période sans lecture

  const [torche, setTorche] = useState(false);
  const [torcheDispo, setTorcheDispo] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [zoomMin, setZoomMin] = useState(1);
  const [zoomMax, setZoomMax] = useState(1);
  const [objectif, setObjectif] = useState('');
  const [diag, setDiag] = useState('');
  const [moteur, setMoteur] = useState('');

  const [active, setActive] = useState(false);
  const [error, setError] = useState('');
  const [supported, setSupported] = useState<boolean | null>(null);
  const [manual, setManual] = useState('');

  useEffect(() => {
    /* La lecture ne depend plus du navigateur : zxing-cpp tourne
       partout, iPhone compris. Seule la camera peut manquer. */
    setSupported(typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia);
  }, []);

  /* Le binaire est chez nous, pas sur un CDN. On le declare une fois,
     avant le premier decodage. */
  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const { prepareZXingModule } = await import('zxing-wasm/reader');
        prepareZXingModule({
          overrides: { locateFile: (fichier: string) => (fichier.endsWith('.wasm') ? '/zxing_reader.wasm' : fichier) },
        });
        if (annule) return;
      } catch { /* le paquet chargera son binaire par defaut */ }
    })();
    return () => { annule = true; };
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
       dessus faisait rater la plupart des scans sans rien apporter. */
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

  /** Zoom optique/numérique du capteur — pas un agrandissement CSS. */
  const reglerZoom = useCallback(async (v: number) => {
    setZoom(v);
    try { await trackRef.current?.applyConstraints({ advanced: [{ zoom: v } as any] }); }
    catch { /* zoom non pilotable */ }
  }, []);

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
    vivantRef.current = false;
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    candidatRef.current = { code: '', vu: 0 };
    natifRef.current = null;
    trackRef.current = null;
    canvasRef.current = null;
    setTorche(false); setTorcheDispo(false); setZoomMax(1); setObjectif(''); setDiag(''); setMoteur('');
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setActive(false);
  }, []);

  const start = useCallback(async () => {
    setError('');
    try {
      /* Choix de l'objectif — c'est ici que se jouait le flou.
         « facingMode: environment » laisse le navigateur choisir, et sur
         les telephones recents il prend souvent l'ULTRA GRAND-ANGLE, qui
         ne fait pas la mise au point de pres : l'image reste floue quel
         que soit le moteur de lecture.
         On demande donc explicitement l'objectif principal arriere, en
         ecartant ceux dont le libelle annonce un ultra grand-angle, un
         teleobjectif ou un capteur de profondeur. */
      let deviceId: string | undefined;
      try {
        // Un premier acces est necessaire pour que les libelles soient lisibles.
        const amorce = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } });
        const sources = (await navigator.mediaDevices.enumerateDevices())
          .filter(d => d.kind === 'videoinput');
        amorce.getTracks().forEach(t => t.stop());

        const arriere = sources.filter(d => /back|arri|rear|environment/i.test(d.label) || sources.length === 1);
        const exclus = /ultra|wide|grand.?angle|t[ée]l[ée]|depth|profondeur|macro/i;
        const principal = arriere.find(d => !exclus.test(d.label)) || arriere[0];
        deviceId = principal?.deviceId;
        setObjectif(principal?.label || 'libellé non communiqué');
      } catch { /* libelles indisponibles : on laisse le navigateur choisir */ }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } }),
          /* 1280x720 plutot que 1080p : au-dela, chaque appel au detecteur
             coute plus cher et on lit MOINS de codes par seconde. */
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

        /* Le zoom evite d'avoir a s'approcher. La plupart des objectifs
           ne font pas le point sous 10 cm : on reste a bonne distance et
           on grossit le code, plutot que de coller le telephone dessus. */
        if (caps.zoom) {
          const min = Number(caps.zoom.min) || 1;
          const max = Number(caps.zoom.max) || 1;
          setZoomMax(max); setZoomMin(min);
          const depart = Math.min(max, Math.max(min, 2));
          await track.applyConstraints({ advanced: [{ zoom: depart } as any] });
          setZoom(depart);
        } else {
          /* Pas de zoom pilotable — c'est le cas de Safari sur iPhone.
             On compense par la definition : plus de pixels sur le code
             permet de le lire de plus loin, la ou l'objectif fait encore
             le point. */
          try {
            await track.applyConstraints({ width: { ideal: 1920 }, height: { ideal: 1080 } });
          } catch { /* definition refusee : on garde celle obtenue */ }
        }
        const r = track?.getSettings?.() || {};
        setDiag([
          `${r.width || '?'}x${r.height || '?'}`,
          caps.zoom ? `zoom ${caps.zoom.min}-${caps.zoom.max}` : 'zoom non pilotable',
          caps.focusMode ? `focus ${(caps.focusMode || []).join('/')}` : 'focus non pilotable',
          caps.torch ? 'lampe' : 'pas de lampe',
        ].join(' · '));
      } catch { /* capacites non exposees */ }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setActive(true);

      /* ── Moteurs ──────────────────────────────────────────────── */
      const { readBarcodes } = await import('zxing-wasm/reader');

      // Voie rapide native, quand le navigateur la propose.
      const Detecteur = (globalThis as any).BarcodeDetector;
      if (Detecteur) {
        try {
          const dispo: string[] = await Detecteur.getSupportedFormats();
          const retenus = FORMATS_NATIF.filter(f => dispo.includes(f));
          if (retenus.length) {
            natifRef.current = new Detecteur({ formats: retenus });
            setMoteur('BarcodeDetector (natif)');
          }
        } catch { /* pas exploitable : on reste sur le WASM */ }
      }
      if (!natifRef.current) setMoteur('zxing-cpp (WASM)');

      /* Le canevas sert de tampon : on y recopie la zone de visée de
         chaque image, et c'est elle qu'on donne au décodeur. */
      const canvas = document.createElement('canvas');
      canvasRef.current = canvas;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });

      vivantRef.current = true;
      depuisRef.current = Date.now();

      /* Boucle chaînée plutôt que setInterval : on relance APRÈS avoir
         fini de décoder. Un intervalle fixe empilerait les appels dès
         qu'une image prend plus longtemps que la cadence prévue. */
      const tour = async () => {
        if (!vivantRef.current) return;
        const v = videoRef.current;
        try {
          if (v && v.readyState >= 2 && v.videoWidth) {
            let lu: { code: string; format: string } | null = null;

            if (natifRef.current) {
              // L'API native accepte l'élément vidéo directement.
              const codes = await natifRef.current.detect(v);
              if (codes?.length) lu = { code: String(codes[0].rawValue || ''), format: String(codes[0].format || '') };
            } else if (ctx) {
              const sx = Math.round(v.videoWidth * ZONE.x);
              const sy = Math.round(v.videoHeight * ZONE.y);
              const sw = Math.round(v.videoWidth * ZONE.w);
              const sh = Math.round(v.videoHeight * ZONE.h);
              if (canvas.width !== sw || canvas.height !== sh) { canvas.width = sw; canvas.height = sh; }
              ctx.drawImage(v, sx, sy, sw, sh, 0, 0, sw, sh);

              const resultats = await readBarcodes(ctx.getImageData(0, 0, sw, sh), {
                formats: FORMATS_WASM as unknown as any,
                tryHarder: true,      // on préfère le temps de calcul au code manqué
                tryRotate: true,      // étiquette de travers sur un carton
                tryInvert: true,      // impression claire sur fond sombre
                tryDownscale: true,
                maxNumberOfSymbols: 1,
                returnErrors: false,  // un code à la clé fausse n'est pas un code
              });
              const bon = (resultats || []).find((r: any) => r.isValid && r.text);
              if (bon) lu = { code: String(bon.text).trim(), format: String(bon.format || '') };
            }

            if (lu?.code) {
              depuisRef.current = Date.now();
              emit(lu.code, lu.format);
            } else if (natifRef.current && Date.now() - depuisRef.current > BASCULE_MS) {
              /* Le détecteur natif ne rend rien depuis un moment. Il est
                 réputé faible sur les EAN imprimés — on ne s'acharne pas,
                 on passe au WASM pour le reste de la session. */
              natifRef.current = null;
              depuisRef.current = Date.now();
              setMoteur('zxing-cpp (WASM)');
            }
          }
        } catch { /* image illisible : on passe à la suivante */ }
        if (vivantRef.current) timerRef.current = setTimeout(tour, INTERVALLE_MS);
      };
      tour();

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

      {/* Zoom : le seul reglage qui change vraiment le resultat. On reste
          a 15-20 cm, distance ou l'objectif fait le point, et on grossit
          le code au lieu de s'approcher jusqu'au flou. */}
      {active && zoomMax > zoomMin && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
          <span className="ms" style={{ fontSize: 18, color: 'rgba(255,255,255,.55)' }}>zoom_out</span>
          <input type="range" min={zoomMin} max={zoomMax} step={0.1} value={zoom}
                 onChange={e => reglerZoom(Number(e.target.value))}
                 style={{ flex: 1, accentColor: '#F4EEE1' }} />
          <span className="sc-num" style={{ fontSize: 11, color: 'rgba(255,255,255,.55)', minWidth: 30, textAlign: 'right' }}>
            {zoom.toFixed(1)}×
          </span>
        </div>
      )}

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

      {/* Saisie manuelle : filet de sécurité quand la caméra manque ou
          que le code est abîmé. */}
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

      {active && (
        <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,.45)', marginTop: 7, lineHeight: 1.5 }}>
          Reste à 15–20 cm et zoome : sous 10 cm la plupart des objectifs ne font plus le point.
          {objectif && <><br />Objectif : {objectif}</>}
          {diag && <><br />{diag}</>}
          {moteur && <><br />Moteur : {moteur}</>}
        </div>
      )}

      {supported === false && (
        <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,.4)', marginTop: 7, lineHeight: 1.5 }}>
          Ce navigateur ne donne pas accès à la caméra. Saisis le code au clavier,
          ou ouvre le back-office depuis un téléphone.
        </div>
      )}
    </div>
  );
}
