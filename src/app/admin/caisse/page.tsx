'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { adminFetch } from '@/lib/auth-client';
import { T, eur } from '@/lib/admin-theme';

/* ═══════════════════════════════════════════════════════════════
   CAISSE  ·  /admin/caisse

   Pensée pour un marché : un ordinateur portable, une scanette USB, le
   téléphone de la vendeuse pour la carte sans contact.

   · La scanette se comporte comme un clavier : elle « tape » le code puis
     Entrée. Le champ de scan garde donc le focus en permanence — après
     chaque clic, il le reprend.
   · Un code inconnu ou un texte libre lance une recherche par nom.
   · Carte : la vendeuse encaisse dans l'application Stripe (Tap to Pay)
     puis valide ici. QR : le client paie sur son téléphone, la caisse
     voit le paiement passer seule.

   Page « nue » (isBare) : plein écran, sans le menu du back-office.
   ═══════════════════════════════════════════════════════════════ */

type Ligne = { id: string; nom: string; image: string | null; prix: number; qty: number; stock: number | null; suivi: boolean };
type Recap = { total: number; nb: number; carte: number; qr: number; ventes: any[] };

const CSS = `
  .cs { position: fixed; inset: 0; display: grid; grid-template-rows: 64px 1fr; background: ${T.appBg}; font-family: 'Jost', system-ui, sans-serif; color: ${T.ink}; }
  .cs-top { display: flex; align-items: center; gap: 16px; padding: 0 20px; background: ${T.topbar}; color: #fff; }
  .cs-top a { color: #C9C2B8; text-decoration: none; font-size: 14px; }
  .cs-main { display: grid; grid-template-columns: minmax(0, 1fr) 380px; min-height: 0; }
  .cs-gauche { display: flex; flex-direction: column; min-height: 0; padding: 18px 20px; gap: 14px; }
  .cs-scan { font-size: 22px; padding: 16px 18px; border: 2px solid ${T.green}; border-radius: 12px; width: 100%; box-sizing: border-box; outline: none; background: #fff; }
  .cs-liste { flex: 1; overflow: auto; background: #fff; border: 1px solid ${T.border}; border-radius: 12px; }
  .cs-ligne { display: grid; grid-template-columns: 56px minmax(0, 1fr) 120px 150px 110px 40px; align-items: center; gap: 12px; padding: 10px 14px; border-bottom: 1px solid ${T.borderFaint2}; }
  .cs-ligne img, .cs-vign { width: 56px; height: 56px; object-fit: contain; background: #F1EADC; border-radius: 8px; }
  .cs-qty { display: flex; align-items: center; gap: 6px; }
  .cs-qty button, .cs-x { width: 40px; height: 40px; border-radius: 10px; border: 1px solid ${T.borderField}; background: #fff; font-size: 22px; cursor: pointer; }
  .cs-x { border: none; color: ${T.red}; font-size: 20px; }
  .cs-droite { background: #fff; border-left: 1px solid ${T.border}; display: flex; flex-direction: column; padding: 20px; gap: 14px; min-height: 0; }
  .cs-total { font-size: 54px; font-weight: 600; letter-spacing: -1px; text-align: right; }
  .cs-btn { width: 100%; padding: 20px; font-size: 21px; font-weight: 600; border: none; border-radius: 14px; cursor: pointer; color: #fff; }
  .cs-btn:disabled { opacity: .4; cursor: not-allowed; }
  .cs-res { position: absolute; z-index: 5; left: 0; right: 0; top: 100%; background: #fff; border: 1px solid ${T.border}; border-radius: 12px; box-shadow: 0 12px 30px rgba(0,0,0,.12); max-height: 50vh; overflow: auto; }
  .cs-res button { display: flex; width: 100%; align-items: center; gap: 12px; padding: 10px 14px; border: none; background: none; text-align: left; cursor: pointer; font-size: 16px; }
  .cs-res button:hover { background: ${T.rowHover}; }
  .cs-modal { position: fixed; inset: 0; background: rgba(21,24,30,.62); display: flex; align-items: center; justify-content: center; z-index: 20; }
  .cs-boite { background: #fff; border-radius: 18px; padding: 32px; width: min(560px, 92vw); text-align: center; }
  .cs-msg { padding: 10px 14px; border-radius: 10px; font-size: 16px; }
  .cs-recap { position: fixed; top: 64px; right: 0; bottom: 0; width: 420px; background: #fff; border-left: 1px solid ${T.border}; z-index: 15; overflow: auto; padding: 18px 20px; box-shadow: -10px 0 30px rgba(0,0,0,.08); }
  @media (max-width: 900px) {
    .cs-main { grid-template-columns: 1fr; grid-template-rows: minmax(0, 1fr) auto; }
    .cs-ligne { grid-template-columns: 44px minmax(0, 1fr) 120px 32px; }
    .cs-ligne .cs-pu, .cs-ligne .cs-lt { display: none; }
    .cs-droite { border-left: none; border-top: 1px solid ${T.border}; }
    .cs-total { font-size: 40px; }
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

export default function CaissePage() {
  const [panier, setPanier] = useState<Ligne[]>([]);
  const [saisie, setSaisie] = useState('');
  const [resultats, setResultats] = useState<any[] | null>(null);
  const [remise, setRemise] = useState('');
  const [test, setTest] = useState(false);
  const [message, setMessage] = useState<{ t: string; ok: boolean } | null>(null);
  const [modal, setModal] = useState<null | 'carte' | 'qr' | 'succes'>(null);
  const [qr, setQr] = useState<{ id: string; svg: string; numero: string; total: number } | null>(null);
  const [succes, setSucces] = useState<{ numero: string; total: number; mode: string } | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [recap, setRecap] = useState<Recap | null>(null);
  const [voirRecap, setVoirRecap] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);

  const sousTotal = Math.round(panier.reduce((s, l) => s + l.prix * l.qty, 0) * 100) / 100;
  const remiseNum = Math.min(Math.max(0, parseFloat(remise.replace(',', '.')) || 0), sousTotal);
  const total = Math.round((sousTotal - remiseNum) * 100) / 100;
  const nbArticles = panier.reduce((s, l) => s + l.qty, 0);

  const focus = useCallback(() => { if (!modal) setTimeout(() => scanRef.current?.focus(), 0); }, [modal]);
  useEffect(() => { focus(); }, [focus, panier.length]);

  const chargerRecap = useCallback(async () => {
    try { const r = await adminFetch('/api/caisse'); if (r.ok) setRecap(await r.json()); } catch { /* réseau */ }
  }, []);
  useEffect(() => { chargerRecap(); }, [chargerRecap]);

  const flash = (t: string, ok: boolean) => { setMessage({ t, ok }); setTimeout(() => setMessage(m => (m?.t === t ? null : m)), 4000); };

  function ajouter(p: any) {
    setPanier(prev => {
      const i = prev.findIndex(l => l.id === p.id);
      if (i >= 0) return prev.map((l, k) => (k === i ? { ...l, qty: l.qty + 1 } : l));
      return [{ id: p.id, nom: p.name_fr, image: p.image_url || null, prix: Number(p.price) || 0, qty: 1,
        stock: typeof p.stock === 'number' ? p.stock : null, suivi: !!p.track_stock }, ...prev];
    });
    bip(true);
    setResultats(null);
    setSaisie('');
  }

  async function traiter(brut: string) {
    const code = brut.trim();
    if (!code) return;
    setSaisie('');
    if (/^\d{8,14}$/.test(code)) {
      try {
        const d = await adminFetch(`/api/scan?ean=${encodeURIComponent(code)}`).then(r => r.json());
        if (d.found && d.product) { ajouter(d.product); return; }
      } catch { /* réseau : on tente la recherche */ }
      bip(false);
      flash(`Code ${code} inconnu : cherchez l'article par son nom.`, false);
      return;
    }
    const d = await adminFetch(`/api/caisse?q=${encodeURIComponent(code)}`).then(r => r.json()).catch(() => ({ produits: [] }));
    if (d.produits?.length === 1) { ajouter(d.produits[0]); return; }
    if (!d.produits?.length) { bip(false); flash(`Aucun article pour « ${code} ».`, false); return; }
    setResultats(d.produits);
  }

  const changerQty = (id: string, delta: number) =>
    setPanier(prev => prev.flatMap(l => (l.id !== id ? [l] : l.qty + delta <= 0 ? [] : [{ ...l, qty: l.qty + delta }])));

  function changerPrix(id: string) {
    const l = panier.find(x => x.id === id);
    const v = window.prompt(`Prix unitaire pour « ${l?.nom} » (€)`, String(l?.prix ?? '').replace('.', ','));
    if (v == null) return focus();
    const n = parseFloat(v.replace(',', '.'));
    if (!(n >= 0)) return focus();
    setPanier(prev => prev.map(x => (x.id === id ? { ...x, prix: Math.round(n * 100) / 100 } : x)));
    focus();
  }

  function vider() { setPanier([]); setRemise(''); setResultats(null); focus(); }

  async function enregistrer(mode: 'carte' | 'qr') {
    setOccupe(true);
    try {
      const r = await adminFetch('/api/caisse', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, test, remise: remiseNum, lignes: panier.map(l => ({ product_id: l.id, qty: l.qty, price: l.prix })) }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Enregistrement impossible');
      return d;
    } finally { setOccupe(false); }
  }

  async function validerCarte() {
    try {
      const d = await enregistrer('carte');
      setSucces({ numero: d.order_number, total: d.total, mode: 'Carte' });
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
          fini = true; setModal(null); setQr(null); flash('Paiement par QR abandonné : le panier est conservé.', false);
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

  useEffect(() => {
    if (modal !== 'succes') return;
    const t = setTimeout(() => { setModal(null); setSucces(null); }, 4000);
    return () => clearTimeout(t);
  }, [modal]);

  return (
    <div className="cs" onClick={() => !modal && !resultats && focus()}>
      <style>{CSS}</style>

      <div className="cs-top">
        <a href="/admin">← Back-office</a>
        <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: .5 }}>Caisse</div>
        <div style={{ flex: 1 }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: test ? '#FFD27A' : '#C9C2B8' }}>
          <input type="checkbox" checked={test} onChange={e => { setTest(e.target.checked); focus(); }} />
          Mode test (ni stock ni facture)
        </label>
        <button onClick={(e) => { e.stopPropagation(); setVoirRecap(v => !v); chargerRecap(); }}
          style={{ background: '#2C3240', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 14px', fontSize: 15, cursor: 'pointer' }}>
          Aujourd’hui : {recap ? `${recap.nb} vente${recap.nb > 1 ? 's' : ''} · ${eur(recap.total)}` : '…'}
        </button>
      </div>

      <div className="cs-main">
        <div className="cs-gauche">
          <div style={{ position: 'relative' }}>
            <input
              ref={scanRef} className="cs-scan" value={saisie} autoComplete="off"
              placeholder="Scannez un article, ou tapez son nom puis Entrée"
              onChange={e => { setSaisie(e.target.value); if (!e.target.value) setResultats(null); }}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); traiter(saisie); } if (e.key === 'Escape') setResultats(null); }}
            />
            {resultats && (
              <div className="cs-res">
                {resultats.map(p => (
                  <button key={p.id} onClick={(e) => { e.stopPropagation(); ajouter(p); }}>
                    {p.image_url ? <img src={p.image_url} alt="" className="cs-vign" style={{ width: 40, height: 40 }} /> : <span className="cs-vign" style={{ width: 40, height: 40 }} />}
                    <span style={{ flex: 1 }}>{p.name_fr}</span>
                    <b>{eur(Number(p.price) || 0)}</b>
                  </button>
                ))}
              </div>
            )}
          </div>

          {message && (
            <div className="cs-msg" style={{ background: message.ok ? '#E9F0E6' : '#FBE7E4', color: message.ok ? T.green : T.red }}>{message.t}</div>
          )}

          <div className="cs-liste">
            {!panier.length && (
              <div style={{ padding: 48, textAlign: 'center', color: T.muted, fontSize: 18 }}>
                Le panier est vide.<br />Scannez le premier article.
              </div>
            )}
            {panier.map(l => (
              <div key={l.id} className="cs-ligne">
                {l.image ? <img src={l.image} alt="" /> : <span className="cs-vign" />}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 17, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.nom}</div>
                  {l.suivi && l.stock !== null && l.stock - l.qty < 0 && (
                    <div style={{ fontSize: 13, color: T.orange }}>Stock indiqué : {l.stock} — vérifiez après le marché</div>
                  )}
                </div>
                <button className="cs-pu" onClick={(e) => { e.stopPropagation(); changerPrix(l.id); }}
                  style={{ border: 'none', background: 'none', fontSize: 16, color: T.text2, cursor: 'pointer', textAlign: 'right' }} title="Modifier le prix">
                  {eur(l.prix)}
                </button>
                <div className="cs-qty" onClick={e => e.stopPropagation()}>
                  <button onClick={() => { changerQty(l.id, -1); focus(); }} aria-label="Retirer un">−</button>
                  <span style={{ minWidth: 30, textAlign: 'center', fontSize: 20, fontWeight: 600 }}>{l.qty}</span>
                  <button onClick={() => { changerQty(l.id, 1); focus(); }} aria-label="Ajouter un">+</button>
                </div>
                <div className="cs-lt" style={{ textAlign: 'right', fontSize: 18, fontWeight: 600 }}>{eur(l.prix * l.qty)}</div>
                <button className="cs-x" onClick={(e) => { e.stopPropagation(); changerQty(l.id, -l.qty); focus(); }} aria-label="Supprimer la ligne">✕</button>
              </div>
            ))}
          </div>
        </div>

        <div className="cs-droite" onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 17, color: T.text2 }}>
            <span>{nbArticles} article{nbArticles > 1 ? 's' : ''}</span><span>{eur(sousTotal)}</span>
          </div>
          <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 17, color: T.text2 }}>
            Remise (€)
            <input value={remise} onChange={e => setRemise(e.target.value)} inputMode="decimal" placeholder="0"
              style={{ width: 110, fontSize: 18, padding: '8px 10px', border: `1px solid ${T.borderField}`, borderRadius: 8, textAlign: 'right' }} />
          </label>
          <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 10 }}>
            <div style={{ fontSize: 15, color: T.muted, textAlign: 'right' }}>À payer</div>
            <div className="cs-total">{eur(total)}</div>
          </div>
          <div style={{ flex: 1 }} />
          <button className="cs-btn" style={{ background: T.green }} disabled={!panier.length || occupe} onClick={() => setModal('carte')}>
            Carte sans contact
          </button>
          <button className="cs-btn" style={{ background: T.blue }} disabled={!panier.length || occupe || total < 0.5} onClick={lancerQr}>
            {occupe ? 'Un instant…' : 'QR code (paiement sur son téléphone)'}
          </button>
          <button onClick={vider} disabled={!panier.length}
            style={{ padding: 12, fontSize: 16, border: `1px solid ${T.borderField}`, background: '#fff', borderRadius: 12, cursor: 'pointer', color: T.text2 }}>
            Vider le panier
          </button>
          {test && <div style={{ fontSize: 13, color: T.amberText, textAlign: 'center' }}>Mode test : QR en carte de test Stripe, aucune sortie de stock, aucune facture.</div>}
        </div>
      </div>

      {modal === 'carte' && (
        <div className="cs-modal">
          <div className="cs-boite">
            <div style={{ fontSize: 16, color: T.muted }}>Encaissez dans l’application Stripe</div>
            <div style={{ fontSize: 64, fontWeight: 600, margin: '8px 0 18px' }}>{eur(total)}</div>
            <ol style={{ textAlign: 'left', fontSize: 17, lineHeight: 1.6, color: T.text2, margin: '0 0 24px', paddingLeft: 22 }}>
              <li>Application Stripe › <b>+</b> › <b>Encaisser</b> › saisir <b>{eur(total)}</b> › Tap to Pay</li>
              <li>Le client pose sa carte ou son téléphone au dos du vôtre</li>
              <li>Quand Stripe affiche « Réussi », appuyez sur <b>Paiement accepté</b></li>
            </ol>
            <button className="cs-btn" style={{ background: T.green, marginBottom: 10 }} disabled={occupe} onClick={validerCarte}>
              {occupe ? 'Enregistrement…' : '✓ Paiement accepté'}
            </button>
            <button onClick={() => { setModal(null); focus(); }} style={{ padding: 12, fontSize: 16, border: 'none', background: 'none', color: T.text2, cursor: 'pointer' }}>
              Annuler (paiement refusé)
            </button>
          </div>
        </div>
      )}

      {modal === 'qr' && qr && (
        <div className="cs-modal">
          <div className="cs-boite">
            <div style={{ fontSize: 16, color: T.muted }}>Le client scanne avec l’appareil photo de son téléphone</div>
            <div style={{ fontSize: 44, fontWeight: 600, margin: '6px 0 12px' }}>{eur(qr.total)}</div>
            <div style={{ width: 300, height: 300, margin: '0 auto 14px' }} dangerouslySetInnerHTML={{ __html: qr.svg.replace(/<svg /, '<svg width="300" height="300" ') }} />
            <div style={{ fontSize: 15, color: T.text2, marginBottom: 18 }}>En attente du paiement… la caisse se met à jour toute seule.</div>
            <button onClick={annulerQr} style={{ padding: 12, fontSize: 16, border: `1px solid ${T.borderField}`, background: '#fff', borderRadius: 10, cursor: 'pointer' }}>
              Annuler
            </button>
          </div>
        </div>
      )}

      {modal === 'succes' && succes && (
        <div className="cs-modal" onClick={() => { setModal(null); setSucces(null); }}>
          <div className="cs-boite">
            <div style={{ fontSize: 72, color: T.green, lineHeight: 1 }}>✓</div>
            <div style={{ fontSize: 28, fontWeight: 600, margin: '10px 0 4px' }}>Vente enregistrée</div>
            <div style={{ fontSize: 18, color: T.text2 }}>{succes.numero} · {eur(succes.total)} · {succes.mode}</div>
            <button className="cs-btn" style={{ background: T.ink, marginTop: 24 }}>Vente suivante</button>
          </div>
        </div>
      )}

      {voirRecap && recap && (
        <div className="cs-recap" onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <b style={{ fontSize: 18 }}>Ventes du jour</b>
            <button onClick={() => { setVoirRecap(false); focus(); }} style={{ border: 'none', background: 'none', fontSize: 22, cursor: 'pointer' }}>✕</button>
          </div>
          <div style={{ fontSize: 34, fontWeight: 600 }}>{eur(recap.total)}</div>
          <div style={{ color: T.text2, marginBottom: 14 }}>{recap.nb} vente{recap.nb > 1 ? 's' : ''} · carte {eur(recap.carte)} · QR {eur(recap.qr)}</div>
          {recap.ventes.map(v => (
            <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${T.borderFaint2}`, color: v.statut === 'delivered' ? T.ink : T.muted }}>
              <span>{new Date(v.heure).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} · {v.numero}{v.test ? ' · test' : ''}{v.statut !== 'delivered' ? ` · ${v.statut === 'pending' ? 'en attente' : 'annulée'}` : ''}</span>
              <span>{eur(v.total)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
