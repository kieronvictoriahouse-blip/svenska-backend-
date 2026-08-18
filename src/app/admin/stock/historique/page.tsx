'use client';
import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { adminFetch } from '@/lib/auth-client';
import { T, BADGE } from '@/lib/admin-theme';
import { useT, nomProduit, formatDate } from '@/lib/admin-i18n';
import { SqueletteTable } from '@/components/Squelette';
import { THI, CAT } from './i18n';

/* ═══════════════════════════════════════════════════════════════
   HISTORIQUE DES STOCKS

   Un mouvement isolé ne raconte rien. Ce qui se lit, c'est la séance :
   « le 13 août, réception GEKAS, 30 articles, +187 unités ». On affiche
   donc des séances repliées, qu'on ouvre pour voir le détail.

   Le niveau avant/après n'existe que depuis le journal unifié : les
   mouvements plus anciens affichent « non enregistré » plutôt qu'un
   zéro, qui se lirait comme un stock vide.
   ═══════════════════════════════════════════════════════════════ */

type Mvt = {
  id: string; product_id: string; nom: string; delta: number;
  qty_before: number | null; qty_after: number | null;
  reason: string | null; reference: string | null; note: string | null; created_at: string;
};
type Seance = {
  cle: string; categorie: keyof typeof CAT; libelle: string; reference: string | null;
  date: string; articles: number; entrees: number; sorties: number; net: number;
  mouvements: Mvt[];
};

const TON: Record<string, { bg: string; fg: string }> = {
  reception: BADGE.green, vente: BADGE.blue, expedition: { bg: '#F3EDF3', fg: '#7B4F7B' },
  inventaire: BADGE.amber, remplacement: { bg: '#FDF6EA', fg: '#8A5B08' },
  controle: BADGE.gray, annulation: BADGE.red, autre: BADGE.gray,
};

export default function HistoriqueStock() {
  return (
    <Suspense fallback={<div className="sc-empty">…</div>}>
      <Historique />
    </Suspense>
  );
}

function Historique() {
  const { t, tc, lang } = useT(THI);
  const produitInitial = useSearchParams().get('produit') || '';

  const [seances, setSeances] = useState<Seance[]>([]);
  const [produits, setProduits] = useState<any[]>([]);
  const [produit, setProduit] = useState(produitInitial);
  const [categorie, setCategorie] = useState('');
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [chargement, setChargement] = useState(true);
  const [toast, setToast] = useState('');

  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3500); };

  useEffect(() => {
    setChargement(true);
    const p = new URLSearchParams();
    if (produit) p.set('produit', produit);
    if (categorie) p.set('categorie', categorie);
    adminFetch(`/api/stock/historique?${p}`).then(r => r.json())
      .then(d => {
        setSeances(d.seances || []);
        // La liste déroulante garde tous les produits, pas seulement ceux du filtre.
        if (!produit && !categorie) setProduits(d.produits || []);
        /* Une seule séance : on l'ouvre, il n'y a rien à choisir. */
        setOuverte((d.seances || []).length === 1 ? d.seances[0].cle : null);
      })
      .catch(() => say(t('msgChargement')))
      .finally(() => setChargement(false));
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [produit, categorie]);

  const totalMvts = useMemo(
    () => seances.reduce((s, x) => s + x.mouvements.length, 0), [seances]);

  const nomDe = (id: string) => {
    const p = produits.find(x => x.id === id);
    return p ? nomProduit(p, lang) : null;
  };

  return (
    <>
      <div className="sc-head">
        <div>
          <div className="sc-title">{t('titre')}</div>
          <div className="sc-sub">{t('sous')}</div>
        </div>
        <div className="sc-actions">
          <Link className="sc-btn sc-btn-secondary" href="/admin/stock">
            <span className="ms">arrow_back</span>{t('retour')}
          </Link>
        </div>
      </div>

      {/* ── Filtres ─────────────────────────────────────── */}
      <div className="sc-card" style={{ padding: '11px 14px', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select className="sc-input sc-select" style={{ height: 32, maxWidth: 280, fontSize: 12 }}
                  value={produit} onChange={e => setProduit(e.target.value)}>
            <option value="">{t('tousProduits')}</option>
            {produits.map(p => (
              <option key={p.id} value={p.id}>{nomProduit(p, lang)}</option>
            ))}
          </select>

          <button className={`sc-chip${categorie === '' ? ' on' : ''}`}
                  style={{ height: 28, fontSize: 11.5, padding: '0 10px' }}
                  onClick={() => setCategorie('')}>{t('toutes')}</button>
          {Object.keys(CAT).map(k => (
            <button key={k} className={`sc-chip${categorie === k ? ' on' : ''}`}
                    style={{ height: 28, fontSize: 11.5, padding: '0 10px' }}
                    onClick={() => setCategorie(k)}>
              {(CAT as any)[k][lang] || (CAT as any)[k].fr}
            </button>
          ))}

          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 11.5, color: T.muted }}>
            {seances.length} {t('seances')} · {totalMvts} {t('mouvements')}
          </span>
        </div>
      </div>

      {chargement && <SqueletteTable lignes={7} colonnes={4} />}
      {!chargement && seances.length === 0 && <div className="sc-empty">{t('aucun')}</div>}

      {/* ── Séances ─────────────────────────────────────── */}
      {!chargement && seances.map(s => {
        const ton = TON[s.categorie] || BADGE.gray;
        const ouvert = ouverte === s.cle;
        const cat = (CAT as any)[s.categorie];
        return (
          <div key={s.cle} className="sc-card" style={{ marginBottom: 8, overflow: 'hidden' }}>
            <button onClick={() => setOuverte(ouvert ? null : s.cle)}
                    aria-expanded={ouvert}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 11, width: '100%',
                      padding: '12px 15px', border: 'none', background: ouvert ? T.sidebarBg : '#fff',
                      cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                      borderLeft: `3px solid ${ton.fg}`,
                    }}>
              <span className="ms" style={{ fontSize: 18, color: T.muted3 }}>
                {ouvert ? 'expand_more' : 'chevron_right'}
              </span>
              <span className="sc-badge" style={{ background: ton.bg, color: ton.fg, whiteSpace: 'nowrap' }}>
                {cat?.[lang] || cat?.fr}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 500, color: T.ink }}>
                  {s.libelle}
                </span>
                <span style={{ display: 'block', fontSize: 11, color: T.muted }}>
                  {formatDate(s.date, lang, true)} · {s.articles} {t('articles')}
                </span>
              </span>
              {s.entrees > 0 && (
                <span className="sc-num" style={{ fontSize: 12, color: T.green, whiteSpace: 'nowrap' }}>
                  +{s.entrees}
                </span>
              )}
              {s.sorties > 0 && (
                <span className="sc-num" style={{ fontSize: 12, color: T.red, whiteSpace: 'nowrap' }}>
                  −{s.sorties}
                </span>
              )}
              <span className="sc-num" style={{
                fontSize: 13, fontWeight: 700, minWidth: 46, textAlign: 'right',
                color: s.net > 0 ? T.green : s.net < 0 ? T.red : T.muted,
              }}>
                {s.net > 0 ? '+' : ''}{s.net}
              </span>
            </button>

            {ouvert && (
              <div style={{ overflowX: 'auto' }}>
                <table className="sc-table" style={{ minWidth: 620 }}>
                  <thead>
                    <tr>
                      <th>{tc('product')}</th>
                      <th className="sc-right" style={{ width: 84 }}>{t('variation')}</th>
                      <th className="sc-right" style={{ width: 76 }}>{t('avant')}</th>
                      <th className="sc-right" style={{ width: 76 }}>{t('apres')}</th>
                      <th style={{ width: 170 }}>{t('motif')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.mouvements.map(m => {
                      const connu = m.qty_before !== null && m.qty_after !== null;
                      return (
                        <tr key={m.id}>
                          <td>
                            <Link href={`/admin/produits/${m.product_id}`}
                                  style={{ fontSize: 12.5, color: T.ink, textDecoration: 'none' }}>
                              {nomDe(m.product_id) || m.nom}
                            </Link>
                            {m.note && (
                              <div style={{ fontSize: 10.5, color: T.muted, paddingTop: 2 }}>{m.note}</div>
                            )}
                          </td>
                          <td className="sc-num sc-right" style={{
                            fontWeight: 700, color: m.delta > 0 ? T.green : T.red,
                          }}>{m.delta > 0 ? '+' : ''}{m.delta}</td>
                          <td className="sc-num sc-right" style={{ color: T.muted }}>
                            {connu ? m.qty_before : '—'}
                          </td>
                          <td className="sc-num sc-right" style={{ color: connu ? T.ink : T.muted }}>
                            {connu ? m.qty_after : '—'}
                          </td>
                          <td style={{ fontSize: 11, color: T.muted }}>{m.reason || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {s.mouvements.some(m => m.qty_before === null) && (
                  <div style={{ padding: '9px 15px', background: '#FDF6EA', fontSize: 11, color: '#8A5B08' }}>
                    {t('ancienFormat')}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, background: T.ink, color: '#fff',
          padding: '10px 18px', borderRadius: 7, fontSize: 12.5, zIndex: 300,
        }}>{toast}</div>
      )}
    </>
  );
}
