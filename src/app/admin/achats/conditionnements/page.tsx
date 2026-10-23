'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { adminFetch } from '@/lib/auth-client';
import { useIsMobile } from '@/lib/use-mobile';
import { C } from '../nouvelle/ui';
import { useT } from '@/lib/admin-i18n';
import { TCD, produitsEnregistres, boutonEnregistrer } from './i18n';

/* ═══════════════════════════════════════════════════════════════
   CONDITIONNEMENTS

   Saisie en un seul passage : 52 fiches produit à ouvrir une par une,
   personne ne le fait. Le tableau garde le focus au clavier, Entrée
   descend d'une ligne, et rien n'est écrit tant qu'on n'enregistre pas.

   Les quantités déjà commandées sont montrées à titre de repère. Elles
   ne pré-remplissent rien : elles reflètent des habitudes d'achat, pas
   le carton du fournisseur.
   ═══════════════════════════════════════════════════════════════ */

type Magasin = { id: string; nom: string; pack: number | null };
type Ligne = {
  id: string; name: string; name_sv: string | null; ref: string;
  image_url: string | null; pack: number; propose: number | null;
  deja: number[]; magasins: Magasin[];
};

const COURANTS = [1, 6, 10, 12, 20, 24];

/* Téléphone : puces de carton à 44 px sur toute la largeur, champ et
   magasins dessous, « Enregistrer » collé en bas au lieu d'en haut.
   Ordinateur inchangé. */
const CSS = `
  @media (max-width: 899px) {
    .cd-head { margin: -12px -12px 0 !important; padding: 8px 12px 10px !important; }
    .cd-back { width: 44px !important; height: 44px !important; }
    .cd-fil { font-size: 12px !important; }
    .cd-intro { font-size: 13px !important; }
    .cd-barre { padding: 12px !important; }
    .cd-recherche { max-width: none !important; flex: 1 1 100% !important; }
    .cd-recherche input { height: 44px !important; font-size: 16px !important; padding-left: 36px !important; }
    .cd-recherche .ms { font-size: 20px !important; left: 10px !important; }
    .cd-vides { min-height: 44px; font-size: 14px !important; }
    .cd-vides input { width: 22px !important; height: 22px !important; }
    .cd-compte { font-size: 12.5px !important; }
    .cd-ligne { padding: 12px !important; row-gap: 10px !important; }
    .cd-info { flex: 1 1 calc(100% - 44px) !important; }
    .cd-info .cd-ref, .cd-info .cd-sv { font-size: 12.5px !important; }
    .cd-chips { flex: 1 1 100%; gap: 6px !important; order: 1; }
    .cd-champ { order: 2; }
    .cd-propose { order: 3; }
    .cd-magbtn { order: 4; margin-left: auto; }
    .cd-chips button { flex: 1 1 0; height: 44px !important; width: auto !important; font-size: 15px !important; border-radius: 9px !important; }
    .cd-propose { min-height: 44px; font-size: 13.5px !important; }
    .cd-champ { width: 72px !important; height: 44px !important; font-size: 17px !important; }
    .cd-magasins { padding: 0 12px 12px !important; gap: 10px !important; }
    .cd-magasins label { font-size: 13.5px !important; flex: 1 1 100%; justify-content: space-between; }
    .cd-magasins input { width: 72px !important; height: 44px !important; font-size: 16px !important; }
    .cd-magasins > span { font-size: 12.5px !important; }
  }
`;

export default function Conditionnements() {
  const { t, tc, lang } = useT(TCD);
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [valeurs, setValeurs] = useState<Record<string, number>>({});
  const [parMagasin, setParMagasin] = useState<Record<string, Record<string, number>>>({});
  const [q, setQ] = useState('');
  const [seulementVides, setSeulementVides] = useState(true);
  const [chargement, setChargement] = useState(true);
  const [envoi, setEnvoi] = useState(false);
  const [toast, setToast] = useState('');
  const [detaille, setDetaille] = useState<string | null>(null);
  const mobile = useIsMobile();

  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 4000); };

  useEffect(() => {
    adminFetch('/api/pack-sizes').then(r => r.json()).then(d => {
      setLignes(d.lignes || []);
      setValeurs(Object.fromEntries((d.lignes || []).map((l: Ligne) => [l.id, l.pack])));
      setParMagasin(Object.fromEntries((d.lignes || []).map((l: Ligne) => [
        l.id, Object.fromEntries(l.magasins.filter(m => m.pack).map(m => [m.id, m.pack as number])),
      ])));
    }).catch(() => say(t('msgChargement')))
      .finally(() => setChargement(false));
  }, []);

  const affichees = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return lignes.filter(l => {
      if (needle && !`${l.name} ${l.name_sv || ''} ${l.ref}`.toLowerCase().includes(needle)) return false;
      if (seulementVides && (valeurs[l.id] || 1) !== 1) return false;
      return true;
    });
  }, [lignes, q, seulementVides, valeurs]);

  /* On n'envoie que ce qui a bougé : réécrire 52 lignes identiques pour
     en corriger une ne sert personne. */
  const modifiees = lignes.filter(l => {
    if ((valeurs[l.id] || 1) !== l.pack) return true;
    const avant = Object.fromEntries(l.magasins.filter(m => m.pack).map(m => [m.id, m.pack]));
    return JSON.stringify(avant) !== JSON.stringify(parMagasin[l.id] || {});
  });

  const restants = lignes.filter(l => (valeurs[l.id] || 1) === 1).length;

  function poser(id: string, v: number) {
    setValeurs(x => ({ ...x, [id]: Math.max(1, Math.round(v) || 1) }));
  }

  /* Entrée descend d'une ligne : la saisie se fait au clavier, sans
     jamais lâcher pour attraper la souris. */
  function auClavier(e: React.KeyboardEvent, index: number) {
    if (e.key !== 'Enter' && e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const pas = e.key === 'ArrowUp' ? -1 : 1;
    const suivant = affichees[index + pas];
    if (suivant) document.getElementById(`pack-${suivant.id}`)?.focus();
  }

  async function enregistrer() {
    if (!modifiees.length) { say(t('msgRienModifie')); return; }
    setEnvoi(true);
    try {
      const res = await adminFetch('/api/pack-sizes', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lignes: modifiees.map(l => ({
            id: l.id, pack: valeurs[l.id] || 1, magasins: parMagasin[l.id] || {},
          })),
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Enregistrement impossible');
      setLignes(ls => ls.map(l => modifiees.find(m => m.id === l.id)
        ? {
            ...l, pack: valeurs[l.id] || 1,
            magasins: l.magasins.map(m => ({ ...m, pack: (parMagasin[l.id] || {})[m.id] || null })),
          }
        : l));
      say(produitsEnregistres(d.produits, lang));
    } catch (e: any) { say(e.message); }
    finally { setEnvoi(false); }
  }

  if (chargement) return <div className="sc-empty">{t('chargement')}</div>;

  /* Ordinateur : dans l'en-tête collant. Téléphone : barre collée en bas. */
  const boutonEnreg = (
    <button onClick={enregistrer} disabled={!modifiees.length || envoi}
            style={{
              height: mobile ? 48 : 34, padding: '0 16px', borderRadius: 8, border: 'none', fontFamily: 'inherit',
              fontSize: mobile ? 15 : 12.5, fontWeight: 600, flex: mobile ? 1 : undefined,
              background: modifiees.length ? C.vert : C.border,
              color: modifiees.length ? '#fff' : C.t6,
              cursor: modifiees.length ? 'pointer' : 'not-allowed',
            }}>
      {envoi ? t('enregistrement')
        : modifiees.length ? boutonEnregistrer(modifiees.length, lang) : t('rienAEnregistrer')}
    </button>
  );

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="cd-head" style={{
        position: 'sticky', top: 0, zIndex: 20, background: C.surface,
        margin: '-16px -18px 0', padding: '10px 18px 12px', borderBottom: `1px solid ${C.border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Link href="/admin/achats" className="sc-iconbtn cd-back"
                style={{ width: 30, height: 30, border: `1px solid ${C.champ}` }} aria-label={t('retourAchats')}>
            <span className="ms" style={{ fontSize: 18 }}>arrow_back</span>
          </Link>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="cd-fil" style={{ fontSize: 10.5, color: C.t5 }}>{t('achats')}</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: C.t1 }}>{t('titre')}</div>
          </div>
          {!mobile && boutonEnreg}
        </div>
      </div>

      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 9, marginTop: 14,
        background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 9, padding: '11px 13px',
      }}>
        <span className="ms" style={{ fontSize: 18, color: C.t4 }}>inventory_2</span>
        <div className="cd-intro" style={{ fontSize: 12, color: C.t3, lineHeight: 1.55 }}>
          {t('explication1')}
          <strong style={{ color: C.t1 }}> {t('explication2')}</strong> {t('explication3')}
        </div>
      </div>

      <div className="sc-card" style={{ marginTop: 12, overflow: 'hidden' }}>
        <div className="cd-barre" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderBottom: `1px solid ${C.ligne}`, flexWrap: 'wrap' }}>
          <div className="cd-recherche" style={{ position: 'relative', flex: '1 1 200px', maxWidth: 280 }}>
            <span className="ms" style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: C.t5 }}>search</span>
            <input className="sc-input" value={q} onChange={e => setQ(e.target.value)} placeholder={t('rechercher')} aria-label={t('rechercher')}
                   style={{ width: '100%', height: 30, paddingLeft: 30, fontSize: 12, background: C.fond }} />
          </div>
          <label className="cd-vides" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.t3, cursor: 'pointer' }}>
            <input type="checkbox" checked={seulementVides} onChange={e => setSeulementVides(e.target.checked)}
                   style={{ width: 14, height: 14, cursor: 'pointer' }} />
            À renseigner seulement
          </label>
          <span style={{ flex: 1 }} />
          <span className="cd-compte" style={{ fontSize: 11.5, color: C.t4 }}>
            {restants} produit(s) encore à 1 sur {lignes.length}
          </span>
        </div>

        {affichees.length === 0 ? (
          <div className="sc-empty">
            {seulementVides ? 'Tous les conditionnements sont renseignés.' : 'Aucun produit ne correspond.'}
          </div>
        ) : affichees.map((l, i) => {
          const v = valeurs[l.id] || 1;
          const change = v !== l.pack;
          const ouvert = detaille === l.id;
          return (
            <div key={l.id} style={{ borderBottom: `1px solid ${C.ligneFaible}`, background: change ? C.vertFond : 'transparent' }}>
              <div className="cd-ligne" style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 14px', flexWrap: 'wrap' }}>
                {l.image_url
                  ? <img src={l.image_url} alt="" style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover', flexShrink: 0, background: C.fond }} />
                  : <div style={{ width: 32, height: 32, borderRadius: 6, flexShrink: 0, border: `1px dashed ${C.champ}` }} />}

                <div className="cd-info" style={{ flex: '1 1 220px', minWidth: 0 }}>
                  <div style={{ fontSize: mobile ? 14.5 : 13, fontWeight: 600, color: C.t1, lineHeight: 1.3 }}>{l.name}</div>
                  {l.name_sv && <div className="cd-sv" style={{ fontSize: 11, color: C.t5, fontStyle: 'italic' }}>{l.name_sv}</div>}
                  <div className="cd-ref" style={{ fontSize: 10.5, color: C.t5, marginTop: 2 }}>
                    {l.ref}
                    {l.deja.length > 0 && ` · déjà commandé par ${Array.from(new Set(l.deja)).join(', ')}`}
                  </div>
                </div>

                {l.propose && l.propose !== v && (
                  <button className="cd-propose" onClick={() => poser(l.id, l.propose!)}
                          title={t('luDansNom')}
                          style={{
                            border: `1px solid ${C.or}`, background: '#FBF6EC', color: '#7A5F26',
                            borderRadius: 6, padding: '4px 9px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                          }}>
                    le nom dit {l.propose}
                  </button>
                )}

                <div className="cd-chips" style={{ display: 'flex', gap: 4 }} role="group" aria-label={`${t('titre')} — ${l.name}`}>
                  {COURANTS.map(n => (
                    <button key={n} onClick={() => poser(l.id, n)} aria-pressed={v === n}
                            style={{
                              width: 28, height: 26, borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                              border: `1px solid ${v === n ? C.ink : C.champ}`,
                              background: v === n ? C.ink : '#fff',
                              color: v === n ? '#fff' : C.t3, fontWeight: v === n ? 600 : 400,
                            }}>{n}</button>
                  ))}
                </div>

                <input id={`pack-${l.id}`} inputMode="numeric" value={v}
                       onChange={e => poser(l.id, Number(e.target.value.replace(/\D/g, '')))}
                       onFocus={e => e.currentTarget.select()}
                       onKeyDown={e => auClavier(e, i)}
                       aria-label={`${t('titre')} — ${l.name}`}
                       className="sc-input sc-num cd-champ"
                       style={{ width: 58, height: 30, fontSize: 13, textAlign: 'center', fontWeight: 600 }} />

                {l.magasins.length > 1 && (
                  <button onClick={() => setDetaille(ouvert ? null : l.id)}
                          title={t('selonMagasin')} aria-label={t('selonMagasin')} aria-expanded={ouvert}
                          className="sc-iconbtn cd-magbtn" style={{ border: `1px solid ${C.champ}` }}>
                    <span className="ms" style={{ fontSize: 17, color: ouvert ? C.accent : C.t4 }}>storefront</span>
                  </button>
                )}
              </div>

              {ouvert && (
                <div className="cd-magasins" style={{ padding: '0 14px 11px 57px', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                  {l.magasins.map(m => (
                    <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: C.t3 }}>
                      {m.nom}
                      <input inputMode="numeric" placeholder={String(v)}
                             value={(parMagasin[l.id] || {})[m.id] || ''}
                             onChange={e => {
                               const n = Number(e.target.value.replace(/\D/g, '')) || 0;
                               setParMagasin(x => {
                                 const pour = { ...(x[l.id] || {}) };
                                 if (n > 1) pour[m.id] = n; else delete pour[m.id];
                                 return { ...x, [l.id]: pour };
                               });
                             }}
                             className="sc-input sc-num"
                             style={{ width: 50, height: 26, fontSize: 12, textAlign: 'center' }} />
                    </label>
                  ))}
                  <span style={{ fontSize: 11, color: C.t5, alignSelf: 'center' }}>
                    vide = même carton que le produit
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {mobile && <div className="sc-sticky-actions">{boutonEnreg}</div>}

      {toast && <div className="sc-toast" role="status" style={{ zIndex: 320 }}>{toast}</div>}
    </>
  );
}
