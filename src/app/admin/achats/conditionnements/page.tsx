'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { adminFetch } from '@/lib/auth-client';
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

  return (
    <>
      <div style={{
        position: 'sticky', top: 0, zIndex: 20, background: C.surface,
        margin: '-16px -18px 0', padding: '10px 18px 12px', borderBottom: `1px solid ${C.border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Link href="/admin/achats" className="sc-iconbtn"
                style={{ width: 30, height: 30, border: `1px solid ${C.champ}` }} aria-label={t('retourAchats')}>
            <span className="ms" style={{ fontSize: 18 }}>arrow_back</span>
          </Link>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10.5, color: C.t5 }}>{t('achats')}</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: C.t1 }}>{t('titre')}</div>
          </div>
          <button onClick={enregistrer} disabled={!modifiees.length || envoi}
                  style={{
                    height: 34, padding: '0 16px', borderRadius: 8, border: 'none', fontFamily: 'inherit',
                    fontSize: 12.5, fontWeight: 600,
                    background: modifiees.length ? C.vert : C.border,
                    color: modifiees.length ? '#fff' : C.t6,
                    cursor: modifiees.length ? 'pointer' : 'not-allowed',
                  }}>
            {envoi ? t('enregistrement')
              : modifiees.length ? boutonEnregistrer(modifiees.length, lang) : t('rienAEnregistrer')}
          </button>
        </div>
      </div>

      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 9, marginTop: 14,
        background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 9, padding: '11px 13px',
      }}>
        <span className="ms" style={{ fontSize: 18, color: C.t4 }}>inventory_2</span>
        <div style={{ fontSize: 12, color: C.t3, lineHeight: 1.55 }}>
          {t('explication1')}
          <strong style={{ color: C.t1 }}> {t('explication2')}</strong> {t('explication3')}
        </div>
      </div>

      <div className="sc-card" style={{ marginTop: 12, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderBottom: `1px solid ${C.ligne}`, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 200px', maxWidth: 280 }}>
            <span className="ms" style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: C.t5 }}>search</span>
            <input className="sc-input" value={q} onChange={e => setQ(e.target.value)} placeholder={t('rechercher')}
                   style={{ width: '100%', height: 30, paddingLeft: 30, fontSize: 12, background: C.fond }} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.t3, cursor: 'pointer' }}>
            <input type="checkbox" checked={seulementVides} onChange={e => setSeulementVides(e.target.checked)}
                   style={{ width: 14, height: 14, cursor: 'pointer' }} />
            À renseigner seulement
          </label>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 11.5, color: C.t4 }}>
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 14px', flexWrap: 'wrap' }}>
                {l.image_url
                  ? <img src={l.image_url} alt="" style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover', flexShrink: 0, background: C.fond }} />
                  : <div style={{ width: 32, height: 32, borderRadius: 6, flexShrink: 0, border: `1px dashed ${C.champ}` }} />}

                <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.t1, lineHeight: 1.3 }}>{l.name}</div>
                  {l.name_sv && <div style={{ fontSize: 11, color: C.t5, fontStyle: 'italic' }}>{l.name_sv}</div>}
                  <div style={{ fontSize: 10.5, color: C.t5, marginTop: 2 }}>
                    {l.ref}
                    {l.deja.length > 0 && ` · déjà commandé par ${Array.from(new Set(l.deja)).join(', ')}`}
                  </div>
                </div>

                {l.propose && l.propose !== v && (
                  <button onClick={() => poser(l.id, l.propose!)}
                          title={t('luDansNom')}
                          style={{
                            border: `1px solid ${C.or}`, background: '#FBF6EC', color: '#7A5F26',
                            borderRadius: 6, padding: '4px 9px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                          }}>
                    le nom dit {l.propose}
                  </button>
                )}

                <div style={{ display: 'flex', gap: 4 }}>
                  {COURANTS.map(n => (
                    <button key={n} onClick={() => poser(l.id, n)}
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
                       className="sc-input sc-num"
                       style={{ width: 58, height: 30, fontSize: 13, textAlign: 'center', fontWeight: 600 }} />

                {l.magasins.length > 1 && (
                  <button onClick={() => setDetaille(ouvert ? null : l.id)}
                          title={t('selonMagasin')}
                          className="sc-iconbtn" style={{ border: `1px solid ${C.champ}` }}>
                    <span className="ms" style={{ fontSize: 17, color: ouvert ? C.accent : C.t4 }}>storefront</span>
                  </button>
                )}
              </div>

              {ouvert && (
                <div style={{ padding: '0 14px 11px 57px', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
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

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, background: C.ink, color: '#fff',
          padding: '10px 18px', borderRadius: 7, fontSize: 12.5, zIndex: 320,
        }}>{toast}</div>
      )}
    </>
  );
}
