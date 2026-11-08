'use client';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { adminFetch } from '@/lib/auth-client';

/* ═══════════════════════════════════════════════════════════════
   CAISSE  ·  /admin/caisse

   Pensée pour un marché : un ordinateur portable, une scanette USB, le
   téléphone de la vendeuse pour la carte sans contact. Design : maquette
   « Caisse Swedish Cravings » validée le 08/11/2026.

   · La scanette se comporte comme un clavier : elle « tape » le code puis
     Entrée. Le champ de scan garde donc le focus en permanence — après
     chaque clic, il le reprend.
   · Les articles sans code-barres sont des tuiles : un appui, un article.
     Par défaut, les articles actifs sans EAN ; la vendeuse peut épingler
     les siens (gardés dans ce navigateur).
   · Carte : la vendeuse encaisse dans l'application Stripe (Tap to Pay)
     puis valide ici. QR : le client paie sur son téléphone, la caisse
     voit le paiement passer seule.
   · Fin de marché : récapitulatif du jour, imprimable et exportable.

   Page « nue » (isBare) : plein écran, sans le menu du back-office.
   ═══════════════════════════════════════════════════════════════ */

type Produit = { id: string; name_fr: string; price: number; image_url?: string | null; stock?: number | null; track_stock?: boolean };
type Ligne = { id: string; nom: string; image: string | null; prix: number; qty: number; stock: number | null; suivi: boolean };
type Vente = { id: string; numero: string; total: number; statut: string; heure: string; test: boolean; mode: string; lignes: Array<{ product_id: string; nom: string; qty: number; prix: number; image: string | null }> };
type Recap = { total: number; nb: number; carte: number; qr: number; ventes: Vente[] };
type Remise = { pct: number } | { eur: number };

const C = {
  fond: '#F3EEE6', encre: '#1C2028', nuit: '#15181E', vert: '#3E5238', vertClair: '#E9F0E6', bleu: '#1C4E80', bleuClair: '#E6EDF6',
  gris: '#6E6459', bord: '#E7E1D8', bordChamp: '#E1DBD2', rouge: '#8C3A2E', ambre: '#F2C14E', creme: '#F1EADC',
};

const eur = (n: number) => (Math.round(n * 100) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

const CSS = `
  .cs { position: fixed; inset: 0; display: grid; grid-template-rows: 64px minmax(0, 1fr); background: ${C.fond}; font-family: 'Jost', system-ui, sans-serif; color: ${C.encre}; font-variant-numeric: tabular-nums; }
  .cs button { font-family: inherit; }
  .ms { font-family: 'Material Symbols Rounded'; font-weight: normal; font-style: normal; line-height: 1; letter-spacing: normal; text-transform: none; display: inline-block; white-space: nowrap; direction: ltr; -webkit-font-smoothing: antialiased; }
  .cs-top { display: flex; align-items: center; gap: 16px; padding: 0 24px; background: ${C.nuit}; color: #F5F1EA; }
  .cs-pill { display: flex; align-items: center; gap: 8px; font-size: 14px; padding: 8px 12px; border-radius: 999px; border: none; }
  .cs-main { display: grid; grid-template-columns: minmax(0, 1fr) 420px; min-height: 0; }
  .cs-gauche { display: flex; flex-direction: column; gap: 16px; padding: 20px 24px; min-height: 0; overflow-y: auto; }
  .cs-scan { display: flex; align-items: center; gap: 14px; height: 72px; box-sizing: border-box; padding: 0 20px; background: #fff; border: 2px solid ${C.vert}; border-radius: 14px; box-shadow: 0 0 0 4px rgba(62, 82, 56, .12); position: relative; }
  .cs-scan input { flex: 1; border: none; outline: none; font-size: 22px; font-family: inherit; background: transparent; color: ${C.encre}; min-width: 0; }
  .cs-scan input::placeholder { color: #8B7E72; }
  .cs-kbd { font-size: 14px; color: ${C.gris}; background: ${C.fond}; border: 1px solid ${C.bordChamp}; border-radius: 8px; padding: 6px 10px; }
  .cs-res { position: absolute; z-index: 6; left: -2px; right: -2px; top: calc(100% + 6px); background: #fff; border: 1px solid ${C.bord}; border-radius: 14px; box-shadow: 0 14px 34px rgba(0,0,0,.14); max-height: 52vh; overflow: auto; padding: 6px; }
  .cs-res button { display: flex; width: 100%; align-items: center; gap: 12px; padding: 10px 12px; border: none; background: none; text-align: left; cursor: pointer; font-size: 17px; border-radius: 10px; color: ${C.encre}; }
  .cs-res button:hover { background: ${C.fond}; }
  .cs-toast { display: flex; align-items: center; gap: 10px; padding: 11px 16px; border-radius: 12px; font-size: 17px; }
  /* Les tuiles ne prennent jamais plus d'un tiers de l'écran : au-delà,
     elles défilent dans leur cadre et le ticket garde sa place. */
  .cs-tuiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px; max-height: 32vh; overflow-y: auto; padding-right: 4px; }
  .cs-tuile { position: relative; display: grid; grid-template-columns: 56px minmax(0, 1fr); grid-template-rows: auto auto; column-gap: 10px; row-gap: 2px; align-items: center; padding: 8px; background: #fff; border: 1px solid ${C.bord}; border-radius: 14px; cursor: pointer; text-align: left; color: ${C.encre}; }
  .cs-tuile:hover { border-color: ${C.vert}; }
  .cs-tuile img, .cs-tuile .cs-ph { grid-row: span 2; width: 56px; height: 56px; object-fit: cover; border-radius: 9px; background: ${C.creme}; }
  .cs-tuile .nom { font-size: 15px; font-weight: 500; line-height: 1.25; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .cs-tuile .px { font-size: 16px; font-weight: 600; color: ${C.vert}; }
  .cs-tuile .moins { position: absolute; top: -8px; right: -8px; width: 30px; height: 30px; border-radius: 50%; border: none; background: ${C.rouge}; color: #fff; display: flex; align-items: center; justify-content: center; }
  .cs-ticket { flex: 1 0 300px; min-height: 300px; display: flex; flex-direction: column; background: #fff; border: 1px solid ${C.bord}; border-radius: 16px; overflow: hidden; }
  .cs-ligne { display: grid; grid-template-columns: 56px minmax(0, 1fr) auto 112px 44px; align-items: center; gap: 16px; padding: 12px 18px; border-bottom: 1px solid #F1EDE7; }
  .cs-ligne img, .cs-ligne .cs-ph { width: 56px; height: 56px; object-fit: contain; background: ${C.creme}; border-radius: 10px; }
  .cs-pas { display: flex; align-items: center; gap: 4px; background: ${C.fond}; border-radius: 12px; padding: 4px; }
  .cs-pas button { width: 44px; height: 44px; border: none; background: #fff; border-radius: 9px; font-size: 24px; color: ${C.encre}; cursor: pointer; }
  .cs-droite { display: flex; flex-direction: column; gap: 18px; padding: 24px; background: #fff; border-left: 1px solid ${C.bord}; min-height: 0; overflow: auto; }
  .cs-chip { height: 48px; border-radius: 12px; font-size: 16px; cursor: pointer; background: #fff; color: ${C.encre}; border: 1px solid ${C.bordChamp}; }
  .cs-chip[aria-pressed="true"] { background: ${C.encre}; color: #fff; border-color: ${C.encre}; font-weight: 600; }
  .cs-pay { display: flex; align-items: center; gap: 18px; padding: 0 26px; border-radius: 18px; cursor: pointer; text-align: left; }
  .cs-pay:disabled { opacity: .4; cursor: not-allowed; }
  .cs-modal { position: fixed; inset: 0; background: rgba(21, 24, 30, .66); display: flex; align-items: center; justify-content: center; z-index: 30; }
  .cs-boite { background: #fff; border-radius: 22px; padding: 36px 40px; display: flex; flex-direction: column; gap: 18px; width: min(620px, 92vw); max-height: 92vh; overflow: auto; }
  .cs-etape { display: flex; gap: 14px; align-items: center; font-size: 18px; }
  .cs-etape .n { width: 34px; height: 34px; flex-shrink: 0; border-radius: 50%; background: ${C.vertClair}; color: ${C.vert}; display: flex; align-items: center; justify-content: center; font-weight: 600; }
  .cs-recap { position: fixed; inset: 64px 0 0 0; z-index: 20; background: ${C.fond}; overflow: auto; }
  .cs-carte { background: #fff; border: 1px solid ${C.bord}; border-radius: 18px; padding: 22px; }
  @media (max-width: 1000px) {
    .cs-main { grid-template-columns: 1fr; grid-template-rows: minmax(0, 1fr) auto; }
    .cs-droite { border-left: none; border-top: 1px solid ${C.bord}; }
    .cs-ligne { grid-template-columns: 44px minmax(0, 1fr) auto 40px; }
    .cs-ligne .lt { display: none; }
  }
  @media print {
    .cs { position: static; display: block; background: #fff; }
    .cs-top, .cs-main, .cs-noprint { display: none !important; }
    .cs-recap { position: static; background: #fff; }
  }
`;

/* Bip court : la vendeuse regarde le client, pas l'écran. Aigu = ajouté,
   grave = code inconnu. */
function bip(ok: boolean) {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.value = ok ? 1320 : 260; o.connect(g); g.connect(ctx.destination);
    g.gain.setValueAtTime(0.15, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (ok ? 0.09 : 0.35));
    o.start(); o.stop(ctx.currentTime + (ok ? 0.1 : 0.36));
  } catch { /* pas de son, pas grave */ }
}

async function qrSvg(texte: string): Promise<string> {
  const { prepareZXingModule, writeBarcode } = await import('zxing-wasm/writer');
  prepareZXingModule({ overrides: { locateFile: (f: string) => (f.endsWith('.wasm') ? '/zxing_writer.wasm' : f) } });
  const r = await writeBarcode(texte, { format: 'QRCode', ecLevel: 'M', scale: 8 } as any);
  if (r.error) throw new Error(r.error);
  // Sans le prologue XML ni le DOCTYPE : le SVG est injecté dans la page.
  return r.svg.slice(r.svg.indexOf('<svg'));
}

/* Préférences de la caisse, propres à cet ordinateur. */
const lireLocal = (k: string, d: string) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const ecrireLocal = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* navigation privée */ } };

export default function CaissePage() {
  const [panier, setPanier] = useState<Ligne[]>([]);
  const [dernier, setDernier] = useState<string | null>(null);
  const [saisie, setSaisie] = useState('');
  const [resultats, setResultats] = useState<Produit[] | null>(null);
  const [remise, setRemise] = useState<Remise>({ pct: 0 });
  const [test, setTest] = useState(false);
  const [toast, setToast] = useState<{ t: string; ok: boolean } | null>(null);
  const [modal, setModal] = useState<null | 'carte' | 'qr' | 'succes'>(null);
  const [qr, setQr] = useState<{ id: string; svg: string; numero: string; total: number } | null>(null);
  const [succes, setSucces] = useState<{ numero: string; total: number; mode: string } | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [recap, setRecap] = useState<Recap | null>(null);
  const [voirRecap, setVoirRecap] = useState(false);
  const [tuiles, setTuiles] = useState<Produit[]>([]);
  const [editTuiles, setEditTuiles] = useState(false);
  const [ajoutTuile, setAjoutTuile] = useState(false);
  const [lieu, setLieu] = useState('');
  const [enLigne, setEnLigne] = useState(true);
  const [heure, setHeure] = useState('');
  const scanRef = useRef<HTMLInputElement>(null);

  const sousTotal = Math.round(panier.reduce((s, l) => s + l.prix * l.qty, 0) * 100) / 100;
  const remiseNum = Math.min(sousTotal, 'pct' in remise ? Math.round(sousTotal * remise.pct) / 100 : remise.eur);
  const total = Math.round((sousTotal - remiseNum) * 100) / 100;
  const nbArticles = panier.reduce((s, l) => s + l.qty, 0);
  const actif = panier.length > 0;

  const focus = useCallback(() => { if (!modal && !voirRecap) setTimeout(() => scanRef.current?.focus(), 0); }, [modal, voirRecap]);
  useEffect(() => { focus(); }, [focus, panier.length]);

  /* Horloge, connexion, lieu. */
  useEffect(() => {
    setLieu(lireLocal('caisse_lieu', ''));
    const maj = () => setHeure(new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }));
    maj(); const t = setInterval(maj, 15000);
    const on = () => setEnLigne(true), off = () => setEnLigne(false);
    setEnLigne(navigator.onLine);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { clearInterval(t); window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  const chargerRecap = useCallback(async () => {
    try { const r = await adminFetch('/api/caisse'); if (r.ok) setRecap(await r.json()); } catch { /* réseau */ }
  }, []);
  useEffect(() => { chargerRecap(); }, [chargerRecap]);

  const chargerTuiles = useCallback(async () => {
    const ids = lireLocal('caisse_tuiles', '');
    try {
      const d = await adminFetch(`/api/caisse?tuiles=1${ids ? '&ids=' + encodeURIComponent(ids) : ''}`).then(r => r.json());
      setTuiles(d.produits || []);
    } catch { /* réseau */ }
  }, []);
  useEffect(() => { chargerTuiles(); }, [chargerTuiles]);

  const flash = (t: string, ok: boolean) => { setToast({ t, ok }); setTimeout(() => setToast(m => (m?.t === t ? null : m)), 4000); };

  function ajouter(p: Produit) {
    setPanier(prev => {
      const i = prev.findIndex(l => l.id === p.id);
      if (i >= 0) return prev.map((l, k) => (k === i ? { ...l, qty: l.qty + 1 } : l));
      return [{ id: p.id, nom: p.name_fr, image: p.image_url || null, prix: Number(p.price) || 0, qty: 1,
        stock: typeof p.stock === 'number' ? p.stock : null, suivi: !!p.track_stock }, ...prev];
    });
    setDernier(p.id);
    bip(true);
    flash(`${p.name_fr} ajouté`, true);
    setResultats(null);
    setSaisie('');
  }

  function epingler(p: Produit) {
    const ids = Array.from(new Set([...tuiles.map(t => t.id), p.id])).slice(0, 12);
    ecrireLocal('caisse_tuiles', ids.join(','));
    setAjoutTuile(false); setResultats(null); setSaisie('');
    chargerTuiles();
  }
  function desepingler(id: string) {
    const ids = tuiles.map(t => t.id).filter(x => x !== id);
    /* Plus rien d'épinglé : on revient au choix par défaut (articles sans EAN). */
    ecrireLocal('caisse_tuiles', ids.join(','));
    setTuiles(tuiles.filter(t => t.id !== id));
  }

  async function traiter(brut: string) {
    const code = brut.trim();
    if (!code) return;
    setSaisie('');
    if (/^\d{8,14}$/.test(code) && !ajoutTuile) {
      try {
        const d = await adminFetch(`/api/scan?ean=${encodeURIComponent(code)}`).then(r => r.json());
        if (d.found && d.product) { ajouter(d.product); return; }
      } catch { /* réseau : on tente la recherche */ }
      bip(false);
      flash(`Code ${code} inconnu : tapez le nom de l’article.`, false);
      return;
    }
    const d = await adminFetch(`/api/caisse?q=${encodeURIComponent(code)}`).then(r => r.json()).catch(() => ({ produits: [] }));
    if (d.produits?.length === 1 && !ajoutTuile) { ajouter(d.produits[0]); return; }
    if (!d.produits?.length) { bip(false); flash(`Aucun article pour « ${code} ».`, false); return; }
    setResultats(d.produits);
  }

  const changerQty = (id: string, delta: number) => {
    setPanier(prev => prev.flatMap(l => (l.id !== id ? [l] : l.qty + delta <= 0 ? [] : [{ ...l, qty: l.qty + delta }])));
    focus();
  };

  function changerPrix(id: string) {
    const l = panier.find(x => x.id === id);
    const v = window.prompt(`Prix unitaire pour « ${l?.nom} » (€)`, String(l?.prix ?? '').replace('.', ','));
    if (v != null) {
      const n = parseFloat(v.replace(',', '.'));
      if (n >= 0) setPanier(prev => prev.map(x => (x.id === id ? { ...x, prix: Math.round(n * 100) / 100 } : x)));
    }
    focus();
  }

  function remiseAutre() {
    const v = window.prompt('Remise en euros sur ce ticket', '');
    if (v != null) {
      const n = parseFloat(v.replace(',', '.'));
      if (n >= 0) setRemise({ eur: Math.round(n * 100) / 100 });
    }
    focus();
  }

  function changerLieu() {
    const v = window.prompt('Nom du marché (affiché en haut et noté sur chaque vente)', lieu);
    if (v != null) { setLieu(v.trim()); ecrireLocal('caisse_lieu', v.trim()); }
    focus();
  }

  function vider() { setPanier([]); setRemise({ pct: 0 }); setResultats(null); setDernier(null); setToast(null); focus(); }

  async function enregistrer(mode: 'carte' | 'qr') {
    setOccupe(true);
    try {
      const r = await adminFetch('/api/caisse', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, test, lieu, remise: remiseNum, lignes: panier.map(l => ({ product_id: l.id, qty: l.qty, price: l.prix })) }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Enregistrement impossible');
      return d;
    } finally { setOccupe(false); }
  }

  async function validerCarte() {
    try {
      const d = await enregistrer('carte');
      setSucces({ numero: d.order_number, total: d.total, mode: 'Carte sans contact' });
      setModal('succes');
      if (d.echecs?.length) flash('Vente enregistrée, mais le stock n’a pas bougé pour un article : à vérifier dans Stocks.', false);
      vider(); chargerRecap();
    } catch (e: any) { flash(e.message, false); }
  }

  async function lancerQr() {
    try {
      const d = await enregistrer('qr');
      const svg = await qrSvg(d.url);
      setQr({ id: d.order_id, svg, numero: d.order_number, total: d.total });
      setModal('qr');
    } catch (e: any) { flash(e.message, false); }
  }

  /* Sondage du paiement QR : toutes les 2 s, tant que la fenêtre est ouverte. */
  useEffect(() => {
    if (modal !== 'qr' || !qr) return;
    let fini = false;
    const tick = async () => {
      if (fini) return;
      try {
        const d = await adminFetch(`/api/caisse?vente=${qr.id}`).then(r => r.json());
        if (d.statut === 'delivered') {
          fini = true; bip(true);
          setSucces({ numero: qr.numero, total: qr.total, mode: 'QR code' });
          setModal('succes'); setQr(null); vider(); chargerRecap();
          return;
        }
        if (['cancelled', 'abandoned'].includes(d.statut)) {
          fini = true; setModal(null); setQr(null); flash('Paiement par QR abandonné : le ticket est conservé.', false);
          return;
        }
      } catch { /* réseau : on réessaie */ }
      setTimeout(tick, 2000);
    };
    const t = setTimeout(tick, 2000);
    return () => { fini = true; clearTimeout(t); };
  }, [modal, qr]); // eslint-disable-line react-hooks/exhaustive-deps

  async function annulerQr() {
    if (!qr) return;
    const d = await adminFetch('/api/caisse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ annuler: qr.id }) })
      .then(r => r.json()).catch(() => ({}));
    if (d.statut === 'paid') return; // payé à la dernière seconde : le sondage va conclure
    setModal(null); setQr(null); focus();
  }

  function clientSuivant() { setModal(null); setSucces(null); focus(); }
  useEffect(() => {
    if (modal !== 'succes') return;
    const t = setTimeout(clientSuivant, 6000);
    return () => clearTimeout(t);
  }, [modal]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Fin de marché : tout se calcule sur les ventes encaissées ───── */
  const stats = useMemo(() => {
    const ok = (recap?.ventes || []).filter(v => v.statut === 'delivered' && !v.test);
    const articles = ok.reduce((s, v) => s + v.lignes.reduce((t, l) => t + l.qty, 0), 0);
    const parProduit = new Map<string, { nom: string; image: string | null; qty: number; montant: number }>();
    for (const v of ok) for (const l of v.lignes) {
      const k = l.product_id || l.nom;
      const e = parProduit.get(k) || { nom: l.nom, image: l.image, qty: 0, montant: 0 };
      e.qty += l.qty; e.montant += l.qty * l.prix; parProduit.set(k, e);
    }
    const top = Array.from(parProduit.values()).sort((a, b) => b.qty - a.qty).slice(0, 6);
    const total = recap?.total || 0;
    return { ok, articles, top, panierMoyen: ok.length ? total / ok.length : 0, partCarte: total ? (recap!.carte / total) : 0 };
  }, [recap]);

  function exporter() {
    const lignes = [['Heure', 'Vente', 'Paiement', 'Statut', 'Article', 'Quantité', 'Prix unitaire', 'Total vente']];
    for (const v of recap?.ventes || []) for (const l of v.lignes) {
      lignes.push([new Date(v.heure).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }), v.numero, v.mode,
        v.test ? 'test' : v.statut, l.nom, String(l.qty), String(l.prix).replace('.', ','), String(v.total).replace('.', ',')]);
    }
    const csv = '﻿' + lignes.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `caisse-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  const statutVente = (v: Vente) => v.test ? { t: 'Test', bg: '#FBF0DA', fg: '#7A4E06' }
    : v.statut === 'delivered' ? (v.mode === 'QR code' ? { t: 'QR code', bg: C.bleuClair, fg: C.bleu } : { t: 'Carte', bg: C.vertClair, fg: C.vert })
    : v.statut === 'pending' ? { t: 'QR en attente', bg: '#FBF0DA', fg: '#7A4E06' } : { t: 'QR abandonné', bg: '#F1EDE7', fg: C.gris };

  return (
    <div className="cs" onClick={() => !modal && !resultats && !voirRecap && focus()}>
      <style>{CSS}</style>

      {/* ── Bandeau ─────────────────────────────────────────────── */}
      <header className="cs-top" onClick={e => e.stopPropagation()}>
        <a href="/admin" title="Retour au back-office" style={{ display: 'flex' }}>
          <img src="/emails/sc-monogramme.png" alt="Swedish Cravings" style={{ width: 22, height: 33, objectFit: 'contain' }} />
        </a>
        <button onClick={changerLieu} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.15, background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }}>
          <span style={{ fontSize: 18, fontWeight: 600 }}>Caisse</span>
          <span style={{ fontSize: 13, color: '#B9B1A5' }}>{lieu || 'Nommer le marché…'}</span>
        </button>
        <div style={{ flex: 1 }} />
        <span className="cs-pill" style={{ color: enLigne ? '#CFE3C8' : '#FFD9D2', background: enLigne ? '#233022' : '#5A1F17' }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: enLigne ? '#7FC46B' : '#FF7A5C' }} />
          {enLigne ? 'En ligne' : 'Hors connexion'}
        </span>
        <button className="cs-pill" aria-pressed={test} onClick={() => { setTest(t => !t); focus(); }}
          style={test ? { background: C.ambre, color: '#2A2006', fontWeight: 600, cursor: 'pointer' } : { background: 'transparent', color: '#CFC7BB', border: '1px solid #3A404C', cursor: 'pointer' }}>
          Mode test
        </button>
        <button onClick={() => { setVoirRecap(v => !v); chargerRecap(); }}
          style={{ display: 'flex', alignItems: 'baseline', gap: 10, background: voirRecap ? '#F5F1EA' : '#262B35', color: voirRecap ? C.encre : '#F5F1EA', border: 'none', borderRadius: 10, padding: '10px 14px', fontSize: 14, cursor: 'pointer' }}>
          <span style={{ opacity: .75 }}>{voirRecap ? 'Retour à la caisse' : 'Aujourd’hui'}</span>
          {!voirRecap && <span style={{ fontWeight: 600, fontSize: 16 }}>{recap ? `${recap.nb} vente${recap.nb > 1 ? 's' : ''} · ${eur(recap.total)}` : '…'}</span>}
        </button>
        <span style={{ fontSize: 18, fontWeight: 500, minWidth: 52, textAlign: 'right' }}>{heure}</span>
      </header>

      {/* ── Vente ───────────────────────────────────────────────── */}
      <div className="cs-main">
        <section className="cs-gauche">
          <div className="cs-scan" onClick={e => e.stopPropagation()}>
            <span className="ms" style={{ fontSize: 34, color: C.vert }} aria-hidden="true">barcode_scanner</span>
            <input
              ref={scanRef} value={saisie} autoComplete="off" aria-label="Scanner ou rechercher un article"
              placeholder={ajoutTuile ? 'Tapez le nom de l’article à épingler, puis Entrée' : 'Scannez un article, ou tapez son nom'}
              onChange={e => { setSaisie(e.target.value); if (!e.target.value) setResultats(null); }}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); traiter(saisie); } if (e.key === 'Escape') { setResultats(null); setAjoutTuile(false); } }}
            />
            <span className="cs-kbd">Entrée ↵</span>
            {resultats && (
              <div className="cs-res">
                {resultats.map(p => (
                  <button key={p.id} onClick={() => (ajoutTuile ? epingler(p) : ajouter(p))}>
                    {p.image_url ? <img src={p.image_url} alt="" style={{ width: 44, height: 44, objectFit: 'contain', background: C.creme, borderRadius: 8 }} /> : <span style={{ width: 44, height: 44, background: C.creme, borderRadius: 8 }} />}
                    <span style={{ flex: 1 }}>{p.name_fr}</span>
                    <b>{eur(Number(p.price) || 0)}</b>
                    {ajoutTuile && <span className="ms" style={{ fontSize: 22, color: C.vert }} aria-hidden="true">push_pin</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {toast && (
            <div className="cs-toast" style={{ background: toast.ok ? C.vertClair : '#FBE7E4', color: toast.ok ? '#2F4029' : '#8C2A1E' }}>
              <span className="ms" style={{ fontSize: 22 }} aria-hidden="true">{toast.ok ? 'check' : 'error'}</span>
              <span>{toast.t}</span>
            </div>
          )}

          {(tuiles.length > 0 || editTuiles) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, letterSpacing: 1.2, textTransform: 'uppercase', color: C.gris }}>Sans code-barres</h2>
                <button onClick={() => { setEditTuiles(v => !v); setAjoutTuile(false); setResultats(null); focus(); }}
                  style={{ fontSize: 14, color: C.gris, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                  {editTuiles ? 'Terminé' : 'Modifier les tuiles'}
                </button>
              </div>
              <div className="cs-tuiles">
                {tuiles.map(t => (
                  <button key={t.id} className="cs-tuile" onClick={() => !editTuiles && ajouter(t)} style={editTuiles ? { cursor: 'default' } : undefined}>
                    {t.image_url ? <img src={t.image_url} alt="" /> : <span className="cs-ph" />}
                    <span className="nom">{t.name_fr}</span>
                    <span className="px">{eur(Number(t.price) || 0)}</span>
                    {editTuiles && (
                      <span className="moins" role="button" aria-label={`Retirer ${t.name_fr} des tuiles`} onClick={e => { e.stopPropagation(); desepingler(t.id); }}>
                        <span className="ms" style={{ fontSize: 20 }} aria-hidden="true">close</span>
                      </span>
                    )}
                  </button>
                ))}
                {editTuiles && tuiles.length < 12 && (
                  <button className="cs-tuile" onClick={() => { setAjoutTuile(true); focus(); }}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, borderStyle: 'dashed', color: C.vert, minHeight: 72 }}>
                    <span className="ms" style={{ fontSize: 36 }} aria-hidden="true">add</span>
                    <span style={{ fontSize: 15, fontWeight: 500 }}>Épingler un article</span>
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="cs-ticket" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid #EFEAE2' }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Ticket</h2>
              <span style={{ fontSize: 15, color: C.gris }}>{nbArticles} article{nbArticles > 1 ? 's' : ''}</span>
              <div style={{ flex: 1 }} />
              <button onClick={vider} disabled={!actif}
                style={{ fontSize: 15, color: C.rouge, background: 'none', border: '1px solid #EBD3CE', borderRadius: 10, padding: '8px 14px', cursor: actif ? 'pointer' : 'default', opacity: actif ? 1 : .4 }}>
                Vider le ticket
              </button>
            </div>
            {!actif && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: C.gris }}>
                <span className="ms" style={{ fontSize: 56, color: '#C4BBAE' }} aria-hidden="true">barcode_scanner</span>
                <span style={{ fontSize: 20, color: C.encre }}>Prêt pour le client suivant</span>
                <span style={{ fontSize: 15 }}>Scannez le premier article</span>
              </div>
            )}
            {actif && (
              <div style={{ flex: 1, overflow: 'auto' }}>
                {panier.map(l => (
                  <div key={l.id} className="cs-ligne" style={{ background: l.id === dernier ? '#F4F8F2' : '#fff' }}>
                    {l.image ? <img src={l.image} alt="" /> : <span className="cs-ph" />}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                      <span style={{ fontSize: 17, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.nom}</span>
                      <button onClick={() => changerPrix(l.id)} title="Modifier le prix"
                        style={{ alignSelf: 'flex-start', fontSize: 14, color: C.gris, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
                        {eur(l.prix)} l’unité <span className="ms" style={{ fontSize: 14, verticalAlign: -2 }} aria-hidden="true">edit</span>
                      </button>
                      {l.suivi && l.stock !== null && l.stock - l.qty < 0 && (
                        <span style={{ fontSize: 13, color: '#A6501F' }}>Stock indiqué : {l.stock} — à vérifier après le marché</span>
                      )}
                    </div>
                    <div className="cs-pas">
                      <button onClick={() => changerQty(l.id, -1)} aria-label="Retirer un">−</button>
                      <span style={{ minWidth: 36, textAlign: 'center', fontSize: 20, fontWeight: 600 }}>{l.qty}</span>
                      <button onClick={() => changerQty(l.id, 1)} aria-label="Ajouter un">+</button>
                    </div>
                    <span className="lt" style={{ fontSize: 20, fontWeight: 600, textAlign: 'right' }}>{eur(l.prix * l.qty)}</span>
                    <button onClick={() => changerQty(l.id, -l.qty)} aria-label="Supprimer la ligne"
                      style={{ width: 44, height: 44, border: 'none', background: 'none', borderRadius: 9, color: C.rouge, cursor: 'pointer' }}>
                      <span className="ms" style={{ fontSize: 22 }} aria-hidden="true">close</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <aside className="cs-droite" onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 20, background: C.fond, borderRadius: 16 }}>
            <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: 1.2, textTransform: 'uppercase', color: C.gris }}>À payer</span>
            <span style={{ fontSize: 72, fontWeight: 600, letterSpacing: -2, lineHeight: 1 }}>{eur(total)}</span>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, color: C.gris, marginTop: 8 }}>
              <span>{nbArticles} article{nbArticles > 1 ? 's' : ''}</span>
              <span>{remiseNum ? `dont remise −${eur(remiseNum)}` : 'sans remise'}</span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#4A4238' }}>Remise</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 8 }}>
              {[0, 5, 10, 15].map(p => (
                <button key={p} className="cs-chip" aria-pressed={'pct' in remise && remise.pct === p}
                  onClick={() => { setRemise({ pct: p }); focus(); }}>{p ? `−${p} %` : 'Aucune'}</button>
              ))}
              <button className="cs-chip" aria-pressed={'eur' in remise} onClick={remiseAutre}>
                {'eur' in remise ? `−${eur(remise.eur)}` : '€…'}
              </button>
            </div>
          </div>

          <div style={{ flex: 1 }} />

          <button className="cs-pay" disabled={!actif || occupe} onClick={() => setModal('carte')}
            style={{ height: 104, border: 'none', background: C.vert, color: '#fff' }}>
            <span className="ms" style={{ fontSize: 40 }} aria-hidden="true">contactless</span>
            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.15 }}>
              <span style={{ fontSize: 24, fontWeight: 600 }}>Carte sans contact</span>
              <span style={{ fontSize: 15, opacity: .85 }}>Sur le téléphone, avec Stripe</span>
            </span>
          </button>
          <button className="cs-pay" disabled={!actif || occupe || total < 0.5} onClick={lancerQr}
            style={{ height: 84, border: `2px solid ${C.bleu}`, background: '#fff', color: C.bleu }}>
            <span className="ms" style={{ fontSize: 36 }} aria-hidden="true">qr_code_2</span>
            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.15 }}>
              <span style={{ fontSize: 21, fontWeight: 600 }}>{occupe ? 'Un instant…' : 'QR code'}</span>
              <span style={{ fontSize: 15, color: '#4A5A6B' }}>Le client paie sur son téléphone</span>
            </span>
          </button>
          {test && <div style={{ fontSize: 14, color: '#7A4E06', background: '#FBF0DA', borderRadius: 10, padding: '8px 12px', textAlign: 'center' }}>Mode test : ni stock ni facture ; QR en carte de test Stripe 4242 4242 4242 4242.</div>}
        </aside>
      </div>

      {/* ── Encaissement par carte ──────────────────────────────── */}
      {modal === 'carte' && (
        <div className="cs-modal">
          <div className="cs-boite" role="dialog" aria-label="Encaissement par carte">
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 16, color: C.gris }}>Montant à saisir dans l’application Stripe</span>
              <span style={{ fontSize: 88, fontWeight: 600, letterSpacing: -2, lineHeight: 1.05 }}>{eur(total)}</span>
            </div>
            <div className="cs-etape"><span className="n">1</span><span>Stripe › <b>+</b> › <b>Encaisser</b> › tapez <b>{eur(total)}</b></span></div>
            <div className="cs-etape"><span className="n">2</span><span>Le client pose sa carte au dos du téléphone</span></div>
            <div className="cs-etape"><span className="n">3</span><span>Stripe affiche « Réussi » : validez ci-dessous</span></div>
            <button onClick={validerCarte} disabled={occupe}
              style={{ height: 84, border: 'none', borderRadius: 16, background: C.vert, color: '#fff', fontSize: 24, fontWeight: 600, cursor: 'pointer' }}>
              {occupe ? 'Enregistrement…' : 'Paiement accepté'}
            </button>
            <button onClick={() => { setModal(null); focus(); }}
              style={{ height: 52, border: `1px solid ${C.bordChamp}`, borderRadius: 14, background: '#fff', color: '#4A4238', fontSize: 17, cursor: 'pointer' }}>
              Paiement refusé — revenir au ticket
            </button>
          </div>
        </div>
      )}

      {/* ── Paiement par QR ─────────────────────────────────────── */}
      {modal === 'qr' && qr && (
        <div className="cs-modal">
          <div className="cs-boite" role="dialog" aria-label="Paiement par QR code" style={{ alignItems: 'center', padding: '32px 40px' }}>
            <span style={{ fontSize: 16, color: C.gris }}>Le client scanne avec l’appareil photo de son téléphone</span>
            <span style={{ fontSize: 56, fontWeight: 600, letterSpacing: -1, lineHeight: 1 }}>{eur(qr.total)}</span>
            <div style={{ padding: 16, border: `1px solid ${C.bord}`, borderRadius: 16 }}>
              <div style={{ width: 290, height: 290 }} dangerouslySetInnerHTML={{ __html: qr.svg.replace(/<svg /, '<svg width="290" height="290" ') }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 17, color: C.bleu, background: C.bleuClair, padding: '10px 16px', borderRadius: 999 }}>
              <span style={{ width: 12, height: 12, borderRadius: '50%', background: C.bleu }} />
              En attente du paiement — l’écran se met à jour seul
            </div>
            <button onClick={annulerQr}
              style={{ height: 52, width: '100%', border: `1px solid ${C.bordChamp}`, borderRadius: 14, background: '#fff', color: '#4A4238', fontSize: 17, cursor: 'pointer' }}>
              Annuler et revenir au ticket
            </button>
          </div>
        </div>
      )}

      {/* ── Vente enregistrée ───────────────────────────────────── */}
      {modal === 'succes' && succes && (
        <div className="cs-modal" onClick={clientSuivant}>
          <div className="cs-boite" role="dialog" aria-label="Vente enregistrée" style={{ alignItems: 'center', textAlign: 'center', width: 'min(520px, 92vw)' }}>
            <div style={{ width: 96, height: 96, borderRadius: '50%', background: C.vertClair, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="ms" style={{ fontSize: 56, color: C.vert }} aria-hidden="true">check</span>
            </div>
            <span style={{ fontSize: 30, fontWeight: 600 }}>Vente enregistrée</span>
            <span style={{ fontSize: 18, color: C.gris }}>{succes.numero} · {eur(succes.total)} · {succes.mode}</span>
            <span style={{ fontSize: 15, color: C.gris }}>{test ? 'Vente de test : ni stock ni facture' : 'Stock mis à jour · facture créée'}</span>
            <button onClick={clientSuivant}
              style={{ marginTop: 8, width: '100%', height: 72, border: 'none', borderRadius: 16, background: C.encre, color: '#fff', fontSize: 22, fontWeight: 600, cursor: 'pointer' }}>
              Client suivant
            </button>
          </div>
        </div>
      )}

      {/* ── Fin de marché ───────────────────────────────────────── */}
      {voirRecap && recap && (
        <div className="cs-recap" onClick={e => e.stopPropagation()}>
          <div style={{ maxWidth: 1400, margin: '0 auto', padding: 24, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 440px', gap: 24 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <h1 style={{ margin: 0, fontSize: 26, fontWeight: 600 }}>
                Fin de marché{lieu ? ` — ${lieu}` : ''}
                <span style={{ fontSize: 16, fontWeight: 400, color: C.gris, marginLeft: 10 }}>{new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
              </h1>
              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr', gap: 16 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 22, background: C.encre, color: '#F5F1EA', borderRadius: 18 }}>
                  <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: 1.2, textTransform: 'uppercase', color: '#B9B1A5' }}>Encaissé</span>
                  <span style={{ fontSize: 52, fontWeight: 600, letterSpacing: -1.5, lineHeight: 1.05 }}>{eur(recap.total)}</span>
                </div>
                {[['Ventes', String(recap.nb)], ['Panier moyen', eur(stats.panierMoyen)], ['Articles vendus', String(stats.articles)]].map(([l, v]) => (
                  <div key={l} className="cs-carte" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span style={{ fontSize: 15, color: C.gris }}>{l}</span>
                    <span style={{ fontSize: 38, fontWeight: 600 }}>{v}</span>
                  </div>
                ))}
              </div>

              <div className="cs-carte" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Par moyen de paiement</h2>
                <div style={{ display: 'flex', height: 18, borderRadius: 9, overflow: 'hidden', gap: 3, background: '#F1EDE7' }}>
                  {recap.carte > 0 && <div style={{ flexGrow: recap.carte, background: C.vert }} />}
                  {recap.qr > 0 && <div style={{ flexGrow: recap.qr, background: '#6F9BC7' }} />}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16 }}>
                  {[['Carte sans contact', recap.carte, C.vert], ['QR code', recap.qr, '#6F9BC7']].map(([l, v, c]) => (
                    <div key={l as string} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ width: 14, height: 14, borderRadius: 4, background: c as string }} />
                      <span style={{ fontSize: 17, flex: 1 }}>{l}</span>
                      <span style={{ fontSize: 17, fontWeight: 600 }}>{eur(v as number)}</span>
                    </div>
                  ))}
                </div>
                <p style={{ margin: 0, fontSize: 15, color: C.gris }}>À rapprocher du total « Paiements » de l’application Stripe : un écart signale un montant mal saisi.</p>
              </div>

              <div className="cs-carte" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 600 }}>Meilleures ventes du jour</h2>
                {!stats.top.length && <span style={{ color: C.gris }}>Aucune vente encaissée pour l’instant.</span>}
                {stats.top.map(p => (
                  <div key={p.nom} style={{ display: 'grid', gridTemplateColumns: '52px minmax(0, 1fr) 80px 110px', alignItems: 'center', gap: 14, padding: '8px 0', borderBottom: '1px solid #F1EDE7' }}>
                    {p.image ? <img src={p.image} alt="" style={{ width: 52, height: 52, objectFit: 'contain', borderRadius: 10, background: C.creme }} /> : <span style={{ width: 52, height: 52, borderRadius: 10, background: C.creme }} />}
                    <span style={{ fontSize: 17 }}>{p.nom}</span>
                    <span style={{ fontSize: 17, color: C.gris, textAlign: 'right' }}>{p.qty} ×</span>
                    <span style={{ fontSize: 17, fontWeight: 600, textAlign: 'right' }}>{eur(p.montant)}</span>
                  </div>
                ))}
              </div>
            </div>

            <aside style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="cs-carte" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #EFEAE2' }}>
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Toutes les ventes</h2>
                  <span style={{ fontSize: 15, color: C.gris }}>la plus récente en haut</span>
                </div>
                {!recap.ventes.length && <div style={{ padding: 20, color: C.gris }}>Pas encore de vente aujourd’hui.</div>}
                {recap.ventes.map(v => {
                  const s = statutVente(v);
                  const barre = v.statut !== 'delivered' || v.test;
                  return (
                    <div key={v.id} style={{ display: 'grid', gridTemplateColumns: '64px minmax(0, 1fr) auto', gap: 12, alignItems: 'center', padding: '13px 20px', borderBottom: '1px solid #F1EDE7', color: barre ? '#8B7E72' : C.encre }}>
                      <span style={{ fontSize: 16, color: C.gris }}>{new Date(v.heure).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16 }}>
                        {v.numero}
                        <span style={{ fontSize: 13, color: s.fg, background: s.bg, padding: '3px 8px', borderRadius: 999 }}>{s.t}</span>
                      </span>
                      <span style={{ fontSize: 17, fontWeight: barre ? 400 : 600, textDecoration: barre ? 'line-through' : 'none' }}>{eur(v.total)}</span>
                    </div>
                  );
                })}
              </div>
              <button className="cs-noprint" onClick={() => window.print()}
                style={{ height: 72, border: 'none', borderRadius: 16, background: C.vert, color: '#fff', fontSize: 21, fontWeight: 600, cursor: 'pointer' }}>
                Imprimer le récapitulatif
              </button>
              <button className="cs-noprint" onClick={exporter}
                style={{ height: 56, border: `1px solid ${C.bordChamp}`, borderRadius: 14, background: '#fff', color: '#4A4238', fontSize: 17, cursor: 'pointer' }}>
                Exporter les ventes (tableur)
              </button>
            </aside>
          </div>
        </div>
      )}
    </div>
  );
}
