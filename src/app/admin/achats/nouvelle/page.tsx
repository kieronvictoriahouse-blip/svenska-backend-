'use client';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { adminFetch } from '@/lib/auth-client';
import {
  Produit, Fournisseur, Enrichi, Methode, enrichir, trier, totaux,
  eur, kr, sekVersEur,
} from './calculs';
import { C, CarteFournisseur, LigneCatalogue, Controle, NomProduit, Vignette, Jauge } from './ui';

/* ═══════════════════════════════════════════════════════════════
   NOUVELLE COMMANDE D'ACHAT

   On ne saisit plus des quantités : on choisit une durée de couverture,
   et le système compose la commande à partir du stock réel et du rythme
   de vente — corrigé des ruptures, sans quoi il recommanderait trop peu
   des produits qui ont manqué et les remettrait en rupture.

   Tout raisonne en cartons : un fournisseur ne livre pas 37 pots.
   ═══════════════════════════════════════════════════════════════ */

const FILTRES = [
  { id: 'Urgent', label: 'Urgent' },
  { id: 'Bientôt', label: 'Bientôt' },
  { id: 'Nouveautés', label: 'Nouveautés' },
  { id: 'Tout', label: 'Tout' },
];

/* useSearchParams impose une frontière de suspense : sans elle, Next
   refuse de prérendre la page. */
export default function NouvelleCommandeAchat() {
  return (
    <Suspense fallback={<div className="sc-empty">Chargement du catalogue…</div>}>
      <Composition />
    </Suspense>
  );
}

function Composition() {
  const router = useRouter();
  /* `?id=` ouvre une commande existante dans ce même écran : c'est ici
     qu'on voit la couverture et les ruptures, donc c'est ici qu'on doit
     pouvoir la corriger. */
  const modifieId = useSearchParams().get('id');

  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([]);
  const [produits, setProduits] = useState<Produit[]>([]);
  const [taux, setTaux] = useState(0.0876);
  const [sansFournisseur, setSansFournisseur] = useState(0);

  const [supId, setSupId] = useState('');
  const [semaines, setSemaines] = useState(6);
  const [panier, setPanier] = useState<Record<string, number>>({});
  const [filtre, setFiltre] = useState('Urgent');
  const [q, setQ] = useState('');

  /* Transport TNT. Reversé sur les articles, pas mis en frais généraux :
     sinon la marge de chaque produit est fausse. Toutes les lignes ne le
     portent pas, d'où les cases à cocher. */
  const [portTexte, setPortTexte] = useState('');
  const [portMethode, setPortMethode] = useState<Methode>('equal');
  const [portExclus, setPortExclus] = useState<Record<string, boolean>>({});

  const [chargement, setChargement] = useState(true);
  const [envoi, setEnvoi] = useState(false);
  const [confirme, setConfirme] = useState<any>(null);
  const [toast, setToast] = useState('');
  const [w, setW] = useState(1400);

  const say = useCallback((m: string) => { setToast(m); setTimeout(() => setToast(''), 4000); }, []);
  const mobile = w < 900;

  useEffect(() => {
    const r = () => setW(window.innerWidth);
    r(); window.addEventListener('resize', r);
    return () => window.removeEventListener('resize', r);
  }, []);

  /* La durée de couverture est un réglage de métier, pas une valeur de
     session : on la retrouve d'une commande à l'autre. */
  useEffect(() => {
    const s = Number(localStorage.getItem('sc_po_weeks'));
    if (s >= 2 && s <= 12) setSemaines(s);
  }, []);
  /* Rouvrir une vieille commande ne doit pas redéfinir la préférence :
     sa couverture était celle du jour où elle a été passée. */
  useEffect(() => {
    if (!modifieId) localStorage.setItem('sc_po_weeks', String(semaines));
  }, [semaines, modifieId]);

  const [numeroModifie, setNumeroModifie] = useState('');
  /* Lignes d'une commande rouverte dont le produit n'est plus au
     catalogue : elles ne peuvent pas être reprises, il faut le dire. */
  const [perdues, setPerdues] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const d = await adminFetch('/api/purchase-planner').then(r => r.json());
        const cat: Produit[] = d.catalogue || [];
        setFournisseurs(d.fournisseurs || []);
        setProduits(cat);
        setTaux(Number(d.rate) || 0.0876);
        setSansFournisseur(d.sansFournisseur || 0);

        if (!modifieId) {
          if (d.fournisseurs?.[0]) setSupId(d.fournisseurs[0].id);
          return;
        }

        /* Reprise d'une commande existante. Les lignes anciennes ne
           connaissent pas les cartons : on les reconstitue depuis la
           quantité, sinon toute commande saisie à la main reviendrait
           vide. */
        const { order } = await adminFetch(`/api/purchase-orders/${modifieId}`).then(r => r.json());
        if (!order) { say('Commande introuvable'); return; }
        setNumeroModifie(order.number || '');
        setSupId(order.supplier_id || '');
        if (order.coverage_weeks) setSemaines(Number(order.coverage_weeks));
        if (Number(order.shipping) > 0) setPortTexte(String(order.shipping).replace('.', ','));

        const lignes = typeof order.lines === 'string' ? JSON.parse(order.lines) : (order.lines || []);
        const reprise: Record<string, number> = {};
        const exclus: Record<string, boolean> = {};
        const orphelines: string[] = [];
        for (const l of lignes) {
          if (!l.product_id) continue;
          const p = cat.find(x => x.id === l.product_id);
          /* Un produit désactivé ou non suivi n'est plus au catalogue :
             sa ligne disparaîtrait du panier, et l'enregistrement la
             supprimerait sans que rien ne le dise. */
          if (!p) { orphelines.push(l.name || 'Article inconnu'); continue; }
          const taille = Math.max(1, Number(l.pack_size)
            || p.sources.find(s => s.sup === order.supplier_id)?.pack || p.pack || 1);
          const cartons = Number(l.packs) || Math.max(1, Math.round((Number(l.qty) || 0) / taille));
          reprise[l.product_id] = cartons;
          if (l.bears_shipping === false) exclus[l.product_id] = true;
        }
        setPanier(reprise);
        setPortExclus(exclus);
        setPerdues(orphelines);
      } catch { say('Chargement impossible'); }
      finally { setChargement(false); }
    })();
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [modifieId]);

  const fournisseur = fournisseurs.find(f => f.id === supId) || null;

  /* Catalogue du magasin sélectionné, enrichi puis trié : ce qui manque
     le plus remonte, sans que personne ait à trier quoi que ce soit. */
  const catalogue = useMemo<Enrichi[]>(() => produits
    .filter(p => p.sources.some(s => s.sup === supId))
    .map(p => enrichir(p, semaines, supId))
    .sort(trier), [produits, supId, semaines]);

  const affiches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return catalogue.filter(p => {
      if (needle && !`${p.name} ${p.name_sv || ''} ${p.ref}`.toLowerCase().includes(needle)) return false;
      if (filtre === 'Urgent') return p.urgency <= 1;
      if (filtre === 'Bientôt') return p.urgency === 2;
      if (filtre === 'Nouveautés') return p.isNew;
      return true;
    });
  }, [catalogue, filtre, q]);

  const port = useMemo(() => ({
    montant: Math.max(0, Number(String(portTexte).replace(',', '.')) || 0),
    methode: portMethode, exclus: portExclus,
  }), [portTexte, portMethode, portExclus]);

  const t = useMemo(() => totaux(panier, catalogue, fournisseur, taux, port),
    [panier, catalogue, fournisseur, taux, port]);

  const lignesPanier = catalogue.filter(p => panier[p.id] > 0);

  /* Changer de magasin vide le panier : les conditionnements et les prix
     diffèrent, mélanger n'aurait aucun sens. */
  function changerFournisseur(id: string) {
    if (id === supId) return;
    if (Object.keys(panier).length && !window.confirm('Changer de magasin vide le panier — les prix et les cartons diffèrent. Continuer ?')) return;
    setSupId(id); setPanier({});
  }

  const ajouter = (p: Enrichi) =>
    setPanier(c => ({ ...c, [p.id]: c[p.id] ? c[p.id] + 1 : Math.max(1, p.suggest) }));

  const regler = (id: string, cartons: number) =>
    setPanier(c => {
      const n = { ...c };
      if (cartons <= 0) delete n[id]; else n[id] = cartons;
      return n;
    });

  /** Compose la commande à partir de tout ce qui presse. */
  function remplirAutomatiquement() {
    const ajouts: Record<string, number> = {};
    for (const p of catalogue) {
      if (p.urgency > 2) continue;
      if (panier[p.id]) continue;
      const n = Math.max(1, p.suggest);
      if (n > 0) ajouts[p.id] = n;
    }
    const combien = Object.keys(ajouts).length;
    if (!combien) { say('Rien à ajouter : tout ce qui presse est déjà au panier'); return; }
    setPanier(c => ({ ...c, ...ajouts }));
    say(`${combien} référence(s) ajoutée(s) d'après ton rythme de vente`);
  }

  async function envoyer() {
    if (!fournisseur || !t.pretAEnvoyer) return;
    setEnvoi(true);
    try {
      const res = await adminFetch('/api/purchase-orders/composer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: modifieId || undefined,
          supplier_id: fournisseur.id,
          coverage_weeks: semaines,
          rate: taux,
          // Le port voyage à part : le bon envoyé au magasin doit porter
          // le prix marchandise, pas un prix gonflé du transport.
          shipping: port.montant,
          shipping_method: port.methode,
          shipping_exclus: lignesPanier.filter(p => portExclus[p.id]).map(p => p.id),
          lignes: lignesPanier.map(p => ({
            product_id: p.id, packs: panier[p.id], pack_size: p.packEffectif,
            qty: panier[p.id] * p.packEffectif,
            unit_cost_eur: p.prix, unit_cost_sek: p.sek,
          })),
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Envoi impossible');
      setConfirme(d);
    } catch (e: any) { say(e.message); }
    finally { setEnvoi(false); }
  }

  /* ── En-tête collant ──────────────────────────────────── */
  const entete = (
    <div style={{
      position: 'sticky', top: 0, zIndex: 20, background: C.surface,
      margin: '-16px -18px 0', padding: '10px 18px 12px', borderBottom: `1px solid ${C.border}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Link href="/admin/achats" className="sc-iconbtn"
              style={{ width: 30, height: 30, border: `1px solid ${C.champ}` }} aria-label="Retour aux achats">
          <span className="ms" style={{ fontSize: 18 }}>arrow_back</span>
        </Link>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 10.5, color: C.t5 }}>Achats · Commandes d’achat</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 16, fontWeight: 600, color: C.t1 }}>
              {modifieId ? `Modifier ${numeroModifie}` : 'Nouvelle commande'}
            </span>
            {fournisseur && <span style={{ fontSize: 12.5, color: C.t4 }}>· {fournisseur.name}</span>}
            {modifieId && (
              <span style={{ fontSize: 10.5, fontWeight: 700, padding: '1px 7px', borderRadius: 20, background: `${C.accent}18`, color: C.accent }}>
                MODIFICATION
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  /* ── Bandeau du curseur — la pièce maîtresse ──────────── */
  const bandeau = (
    <div style={{ background: C.nuit, borderRadius: 11, padding: '14px 16px', marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <span className="ms" style={{ fontSize: 20, color: C.or }}>tune</span>
        <div style={{ minWidth: 190 }}>
          <label htmlFor="couverture" style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>
            Je veux tenir <span style={{ color: C.orClair }}>{semaines} semaines</span>
          </label>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,.5)', marginTop: 2 }}>
            Les quantités conseillées se recalculent sur tes ventes réelles
            {fournisseur ? ` et le délai de ${fournisseur.delay} jours` : ''}
          </div>
        </div>
        <input id="couverture" type="range" min={2} max={12} step={1} value={semaines}
               onChange={e => setSemaines(Number(e.target.value))}
               style={{ flex: '1 1 200px', minWidth: 160, accentColor: C.or, cursor: 'pointer', height: 4 }} />
      </div>
    </div>
  );

  /* ── Panier ───────────────────────────────────────────── */
  const compteur = (valeur: string, libelle: string) => (
    <div style={{ background: C.surface, padding: '10px 12px', textAlign: 'center' }}>
      <div className="sc-num" style={{ fontSize: 17, fontWeight: 700, color: C.t1 }}>{valeur}</div>
      <div style={{ fontSize: 8.5, letterSpacing: 1.2, textTransform: 'uppercase', color: C.t5, marginTop: 2 }}>{libelle}</div>
    </div>
  );

  const cible = semaines * 7;
  const panierBloc = (
    <div style={{
      width: mobile ? '100%' : 320, flexShrink: 0,
      position: mobile ? 'static' : 'sticky', top: 70, alignSelf: 'flex-start',
    }}>
      <div className="sc-card" style={{ overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1, background: C.ligne }}>
          {compteur(String(t.lignes), 'lignes')}
          {compteur(String(t.unites), 'unités')}
          {compteur(t.couvertureMoyenne ? `${t.couvertureMoyenne} j` : '—', 'couverture')}
        </div>

        <div style={{ maxHeight: mobile ? 'none' : 320, overflowY: 'auto' }}>
          {lignesPanier.length === 0 ? (
            <div style={{ padding: '26px 16px', fontSize: 12, color: C.t4, lineHeight: 1.6, textAlign: 'center' }}>
              Panier vide. <strong style={{ color: C.t2 }}>Remplir automatiquement</strong> compose la commande
              à partir de tes ruptures et de ton rythme de vente.
            </div>
          ) : lignesPanier.map(p => {
            const cartons = panier[p.id];
            const u = cartons * p.packEffectif;
            const couvApres = p.daily > 0 ? Math.round((p.stock + u) / p.daily) : 999;
            const surstock = couvApres > cible * 1.6;
            const part = t.parts[p.id];
            const portePort = port.montant > 0 && !portExclus[p.id];
            return (
              <div key={p.id} style={{ display: 'flex', gap: 9, padding: '10px 12px', borderBottom: `1px solid ${C.ligneFaible}` }}>
                {port.montant > 0 ? (
                  <input type="checkbox" checked={!portExclus[p.id]}
                         onChange={e => setPortExclus(x => ({ ...x, [p.id]: !e.target.checked }))}
                         title="Cet article porte une part du transport"
                         style={{ width: 15, height: 15, marginTop: 8, accentColor: C.accent, cursor: 'pointer', flexShrink: 0 }} />
                ) : <Vignette p={p} taille={30} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <NomProduit p={p} taille={12.5} />
                  <div className="sc-num" style={{ fontSize: 11, color: C.t4, marginTop: 2 }}>
                    {cartons} × {p.packEffectif} = {u} u.
                    {portePort && part && (
                      <span style={{ color: C.accent }}>
                        {' · revient '}{eur(part.revient)}/u.
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <Jauge valeur={couvApres / Math.max(1, cible)} couleur={surstock ? C.ambre : C.vert} largeur={70} hauteur={4} />
                    <span style={{ fontSize: 10.5, color: surstock ? C.ambre : C.t5 }}>
                      couvre {couvApres > 180 ? '> 6 mois' : `${couvApres} j`}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button onClick={() => regler(p.id, cartons - 1)} aria-label="Un carton de moins"
                            style={{ width: 24, height: 24, borderRadius: 6, border: `1px solid ${C.champ}`, background: '#fff', cursor: 'pointer', lineHeight: 1 }}>−</button>
                    <span className="sc-num" style={{ fontSize: 12.5, fontWeight: 700, minWidth: 18, textAlign: 'center' }}>{cartons}</span>
                    <button onClick={() => regler(p.id, cartons + 1)} aria-label="Un carton de plus"
                            style={{ width: 24, height: 24, borderRadius: 6, border: `1px solid ${C.champ}`, background: '#fff', cursor: 'pointer', lineHeight: 1 }}>+</button>
                  </div>
                  <span className="sc-num" style={{ fontSize: 11.5, fontWeight: 600, color: C.vert }}>
                    {eur(p.sek != null ? sekVersEur(p.sek * u, taux) : p.prix * u)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Jauge de franco */}
        {!!fournisseur?.franco && (
          <div style={{ padding: '11px 13px', borderTop: `1px solid ${C.ligne}` }}>
            <Jauge valeur={t.sek / fournisseur.franco} couleur={t.francoAtteint ? C.vert : C.accent} largeur="100%" hauteur={7} />
            <div style={{ fontSize: 11, marginTop: 6, color: t.francoAtteint ? C.vert : C.ambre, fontWeight: 600 }}>
              {t.francoAtteint ? 'Franco atteint — port offert' : `Encore ${kr(t.francoReste)} pour le port offert`}
            </div>
          </div>
        )}

        {/* Transport — un coût d'achat, pas un frais général. */}
        <div style={{ padding: '11px 13px', borderTop: `1px solid ${C.ligne}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="ms" style={{ fontSize: 17, color: C.t4 }}>local_shipping</span>
            <label htmlFor="port" style={{ fontSize: 12, color: C.t2, flex: 1 }}>Transport (TNT, colis)</label>
            <input id="port" inputMode="decimal" value={portTexte}
                   onChange={e => setPortTexte(e.target.value)} placeholder="0,00"
                   className="sc-input sc-num"
                   style={{ width: 76, height: 28, fontSize: 12, textAlign: 'right', padding: '0 8px' }} />
            <span style={{ fontSize: 12, color: C.t4 }}>€</span>
          </div>

          {port.montant > 0 && (
            <>
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                {([['equal', 'Par unité'], ['prorata', 'Au prorata du prix']] as const).map(([id, lib]) => (
                  <button key={id} onClick={() => setPortMethode(id as Methode)}
                          style={{
                            flex: 1, border: `1px solid ${portMethode === id ? C.accent : C.champ}`,
                            background: portMethode === id ? `${C.accent}12` : '#fff',
                            color: portMethode === id ? C.accent : C.t3, fontWeight: portMethode === id ? 600 : 400,
                            borderRadius: 6, padding: '5px 6px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                          }}>{lib}</button>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7 }}>
                <span style={{ fontSize: 11, color: C.t4, flex: 1, lineHeight: 1.45 }}>
                  Réparti sur {lignesPanier.filter(p => !portExclus[p.id]).length} des {lignesPanier.length} lignes cochées ci-dessus.
                </span>
                <button onClick={() => setPortExclus({})}
                        style={{ border: 'none', background: 'none', color: C.accent, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline' }}>
                  Tout cocher
                </button>
              </div>
              {lignesPanier.length > 0 && lignesPanier.every(p => portExclus[p.id]) && (
                <div style={{ fontSize: 11, color: C.ambre, marginTop: 5 }}>
                  Aucune ligne cochée : le port ne sera reversé sur rien.
                </div>
              )}
            </>
          )}
        </div>

        <div style={{ padding: '12px 13px', borderTop: `1px solid ${C.ligne}`, background: C.surfaceAlt }}>
          {t.sek > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: C.t3 }}>
              <span>Marchandise (magasin)</span><span className="sc-num">{kr(t.sek)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: C.t3, marginTop: 3 }}>
            <span>Marchandise HT</span><span className="sc-num">{eur(t.eur)}</span>
          </div>
          {t.port > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: C.t3, marginTop: 3 }}>
              <span>Transport</span><span className="sc-num">{eur(t.port)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 6 }}>
            <span style={{ fontSize: 9.5, letterSpacing: 1.2, textTransform: 'uppercase', color: C.t5, fontWeight: 600 }}>
              {t.port > 0 ? 'Prix de revient HT' : 'Coût d’achat HT'}
            </span>
            <span className="sc-num" style={{ fontSize: 22, fontWeight: 700, color: C.t1 }}>{eur(t.eurAvecPort)}</span>
          </div>
        </div>

        <div style={{ padding: '11px 13px', borderTop: `1px solid ${C.ligne}` }}>
          <div style={{ fontSize: 9.5, letterSpacing: 1.2, textTransform: 'uppercase', color: C.t5, fontWeight: 600, marginBottom: 4 }}>
            Avant d’envoyer
          </div>
          <Controle ok={t.lignes > 0}>Au moins une ligne</Controle>
          <Controle ok={t.minAtteint}>
            {fournisseur?.min ? `Minimum de commande — ${kr(fournisseur.min)}` : 'Pas de minimum de commande'}
          </Controle>
          <Controle ok={t.urgencesOubliees === 0}>
            {t.urgencesOubliees === 0
              ? 'Aucune urgence oubliée'
              : `${t.urgencesOubliees} produit(s) urgent(s) absent(s) du panier`}
          </Controle>
          <Controle ok={t.francoAtteint}>
            {t.francoAtteint ? 'Franco de port' : 'Franco de port non atteint — non bloquant'}
          </Controle>
        </div>

        <div style={{ padding: 13, borderTop: `1px solid ${C.ligne}`, display: 'flex', gap: 8 }}>
          <button onClick={envoyer} disabled={!t.pretAEnvoyer || envoi} aria-live="polite"
                  style={{
                    flex: 1, height: 40, borderRadius: 8, border: 'none', fontFamily: 'inherit',
                    fontSize: 13, fontWeight: 600,
                    background: t.pretAEnvoyer ? C.vert : C.border,
                    color: t.pretAEnvoyer ? '#fff' : C.t6,
                    cursor: t.pretAEnvoyer ? 'pointer' : 'not-allowed',
                  }}>
            {envoi ? 'Enregistrement…'
              : modifieId ? 'Enregistrer les modifications'
              : `Envoyer à ${fournisseur?.name || '…'}`}
          </button>
        </div>
      </div>
    </div>
  );

  /* ── Rendu ────────────────────────────────────────────── */
  if (chargement) return <div className="sc-empty">Chargement du catalogue…</div>;

  return (
    <>
      {entete}

      {perdues.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 9, marginTop: 14,
          background: '#FBEEEC', border: '1px solid #E8C4BE', borderRadius: 9, padding: '10px 13px',
        }}>
          <span className="ms" style={{ fontSize: 18, color: C.rouge }}>report</span>
          <div style={{ fontSize: 12, color: C.rouge, lineHeight: 1.5 }}>
            <strong>{perdues.length} ligne(s) ne peuvent pas être reprises</strong> — leur produit
            n’est plus au catalogue actif ({perdues.join(', ')}). Si tu enregistres, elles seront
            retirées de la commande. Réactive le produit d’abord pour les conserver.
          </div>
        </div>
      )}

      {/* Tant que les cartons valent 1, tout l'écran raisonne en unités
          en se donnant l'air de compter des cartons. */}
      {catalogue.length > 0 && catalogue.every(p => p.packEffectif === 1) && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 9, marginTop: 14,
          background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 13px',
        }}>
          <span className="ms" style={{ fontSize: 18, color: C.t4 }}>inventory_2</span>
          <div style={{ fontSize: 12, color: C.t3, lineHeight: 1.5, flex: 1 }}>
            Aucun conditionnement n’est renseigné : « 19 cartons » veut donc dire 19 unités.
          </div>
          <Link href="/admin/achats/conditionnements"
                style={{ fontSize: 12, fontWeight: 600, color: C.accent, whiteSpace: 'nowrap' }}>
            Les renseigner
          </Link>
        </div>
      )}

      {sansFournisseur > 0 && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 9, marginTop: 14,
          background: '#FDF6EA', border: '1px solid #E8CFA8', borderRadius: 9, padding: '10px 13px',
        }}>
          <span className="ms" style={{ fontSize: 18, color: C.ambre }}>info</span>
          <div style={{ fontSize: 12, color: C.ambre, lineHeight: 1.5 }}>
            <strong>{sansFournisseur} produit(s) sans magasin connu</strong> — ils n’apparaissent dans aucune
            liste de réappro. Renseigne où tu les achètes depuis leur fiche produit.
          </div>
        </div>
      )}

      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 9.5, letterSpacing: 1.2, textTransform: 'uppercase', color: C.t5, fontWeight: 600, marginBottom: 8 }}>
          1 · Où achètes-tu ?
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {fournisseurs.map(f => (
            <CarteFournisseur key={f.id} f={f} actif={f.id === supId} onClick={() => changerFournisseur(f.id)} />
          ))}
        </div>
      </div>

      {bandeau}

      <div style={{ display: 'flex', gap: 12, marginTop: 14, alignItems: 'flex-start', flexWrap: mobile ? 'wrap' : 'nowrap' }}>
        <div style={{ flex: '2 1 540px', minWidth: 0 }}>
          <div className="sc-card" style={{ overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px', borderBottom: `1px solid ${C.ligne}`, flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', maxWidth: 260, flex: '1 1 180px' }}>
                <span className="ms" style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: C.t5 }}>search</span>
                <input className="sc-input" value={q} onChange={e => setQ(e.target.value)}
                       placeholder="Rechercher" style={{ width: '100%', height: 30, paddingLeft: 30, fontSize: 12, background: C.fond }} />
              </div>
              {FILTRES.map(f => (
                <button key={f.id} onClick={() => setFiltre(f.id)}
                        style={{
                          border: 'none', cursor: 'pointer', fontFamily: 'inherit', borderRadius: 6,
                          padding: '5px 10px', fontSize: 11.5,
                          background: filtre === f.id ? C.ink : 'transparent',
                          color: filtre === f.id ? '#fff' : C.t3, fontWeight: filtre === f.id ? 600 : 400,
                        }}>{f.label}</button>
              ))}
              <span style={{ flex: 1 }} />
              <button onClick={remplirAutomatiquement}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid #E3D6E3',
                        background: '#F3EDF3', color: '#6E4470', borderRadius: 7, padding: '6px 12px',
                        fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                      }}>
                <span className="ms" style={{ fontSize: 17 }}>bolt</span>Remplir automatiquement
              </button>
            </div>

            {affiches.length === 0 ? (
              <div className="sc-empty">Rien à réapprovisionner dans ce filtre — bonne nouvelle.</div>
            ) : affiches.map(p => (
              <LigneCatalogue key={p.id} p={p} semaines={semaines} cartons={panier[p.id] || 0}
                              onAdd={() => ajouter(p)} />
            ))}
          </div>
        </div>

        {panierBloc}
      </div>

      {confirme && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(21,24,30,.45)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div className="sc-card" style={{ maxWidth: 420, textAlign: 'center', padding: 26 }}>
            <div style={{ width: 46, height: 46, borderRadius: 23, background: '#E9F0E6', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
              <span className="ms" style={{ fontSize: 24, color: C.vert }}>mark_email_read</span>
            </div>
            <div style={{ fontSize: 17, fontWeight: 600, color: C.t1 }}>Commande enregistrée</div>
            <div style={{ fontSize: 12.5, color: C.t3, lineHeight: 1.6, marginTop: 8 }}>{confirme.message}</div>
            <button className="sc-btn sc-btn-primary" style={{ marginTop: 16, width: '100%', justifyContent: 'center' }}
                    onClick={() => router.push('/admin/achats')}>
              Retour aux commandes d’achat
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: mobile ? 70 : 24, right: 24, background: C.ink, color: '#fff',
          padding: '10px 18px', borderRadius: 7, fontSize: 12.5, zIndex: 320, maxWidth: 'calc(100vw - 48px)',
        }}>{toast}</div>
      )}
    </>
  );
}
