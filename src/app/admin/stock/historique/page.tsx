'use client';
import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { adminFetch } from '@/lib/auth-client';
import { T, BADGE } from '@/lib/admin-theme';
import { useT, nomProduit, formatDate } from '@/lib/admin-i18n';
import { SqueletteTable } from '@/components/Squelette';
import { useIsMobile } from '@/lib/use-mobile';
import { THI, CAT } from './i18n';

/* Téléphone : filtres en une rangée qui défile, séances sur deux lignes
   (le badge ne mange plus le libellé), mouvements en liste au lieu d'un
   tableau de 620 px. Ordinateur inchangé. */
const CSS = `
  @media (max-width: 899px) {
    .sh-filtres { padding: 12px !important; }
    .sh-filtres .sc-select { max-width: none !important; }
    .sh-chips { margin-top: 10px; }
    .sh-compte { font-size: 12.5px; color: ${T.muted}; margin-top: 8px; }
    .sh-mvt { display: flex; gap: 12px; align-items: flex-start; padding: 11px 15px; border-top: 1px solid ${T.borderFaint}; }
    .sh-mvt-nom { font-size: 14.5px; color: ${T.ink}; text-decoration: none; font-weight: 500; }
    .sh-mvt-sub { font-size: 12.5px; color: ${T.muted}; margin-top: 3px; }
  }
`;

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
  /* Lecture coupée côté serveur (les N mouvements les plus récents) :
     on le dit plutôt que de laisser croire que l'historique s'arrête là. */
  const [tronque, setTronque] = useState<number | null>(null);
  const mobile = useIsMobile();

  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3500); };

  useEffect(() => {
    setChargement(true);
    const p = new URLSearchParams();
    if (produit) p.set('produit', produit);
    if (categorie) p.set('categorie', categorie);
    adminFetch(`/api/stock/historique?${p}`).then(r => r.json())
      .then(d => {
        setSeances(d.seances || []);
        setTronque(d.tronque ? Number(d.limite) || null : null);
        /* La liste déroulante garde tous les produits vus, pas seulement
           ceux du filtre. Elle les cumule : ouverte depuis la liste des
           stocks (?produit=…), elle restait vide et affichait « Tous les
           produits » alors que l'écran était filtré sur un seul. */
        setProduits(prev => {
          const vus = new Map(prev.map(p => [p.id, p] as [string, any]));
          for (const p of d.produits || []) if (!vus.has(p.id)) vus.set(p.id, p);
          return Array.from(vus.values())
            .sort((a, b) => String(a.name_fr || '').localeCompare(String(b.name_fr || ''), 'fr'));
        });
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

  const selectProduit = (
    <select className="sc-input sc-select" style={mobile ? undefined : { height: 32, maxWidth: 280, fontSize: 12 }}
            aria-label={t('tousProduits')}
            value={produit} onChange={e => setProduit(e.target.value)}>
      <option value="">{t('tousProduits')}</option>
      {produits.map(p => (
        <option key={p.id} value={p.id}>{nomProduit(p, lang)}</option>
      ))}
    </select>
  );
  const chipStyle = mobile ? undefined : { height: 28, fontSize: 11.5, padding: '0 10px' };
  const chips = (
    <>
      <button className={`sc-chip${categorie === '' ? ' on' : ''}`} style={chipStyle}
              aria-pressed={categorie === ''} onClick={() => setCategorie('')}>{t('toutes')}</button>
      {Object.keys(CAT).map(k => (
        <button key={k} className={`sc-chip${categorie === k ? ' on' : ''}`} style={chipStyle}
                aria-pressed={categorie === k} onClick={() => setCategorie(k)}>
          {(CAT as any)[k][lang] || (CAT as any)[k].fr}
        </button>
      ))}
    </>
  );

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
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
      {mobile ? (
        <div className="sc-card sh-filtres" style={{ marginBottom: 12 }}>
          {selectProduit}
          <div className="sc-filters sh-chips">{chips}</div>
          <div className="sh-compte">{seances.length} {t('seances')} · {totalMvts} {t('mouvements')}</div>
        </div>
      ) : (
      <div className="sc-card" style={{ padding: '11px 14px', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {selectProduit}
          {chips}

          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 11.5, color: T.muted }}>
            {seances.length} {t('seances')} · {totalMvts} {t('mouvements')}
          </span>
        </div>
      </div>
      )}

      {!chargement && tronque && (
        <div role="note" style={{
          display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 12, padding: '9px 13px',
          background: '#FDF6EA', border: '1px solid #E8CFA8', borderRadius: 9,
          fontSize: mobile ? 12.5 : 11.5, color: '#8A5B08', lineHeight: 1.5,
        }}>
          <span className="ms" style={{ fontSize: 17 }}>info</span>
          <span>{t('tronque').replace('{n}', String(tronque))}</span>
        </div>
      )}

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
              <span className="ms" style={{ fontSize: mobile ? 22 : 18, color: T.muted3 }}>
                {ouvert ? 'expand_more' : 'chevron_right'}
              </span>
              {mobile ? (
                /* Téléphone : libellé en entier, badge et date dessous. */
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 15, fontWeight: 600, color: T.ink, lineHeight: 1.3 }}>{s.libelle}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                    <span className="sc-badge" style={{ background: ton.bg, color: ton.fg }}>{cat?.[lang] || cat?.fr}</span>
                    <span style={{ fontSize: 12.5, color: T.muted }}>{formatDate(s.date, lang, true)} · {s.articles} {t('articles')}</span>
                  </span>
                  {s.entrees > 0 && s.sorties > 0 && (
                    <span className="sc-num" style={{ display: 'block', fontSize: 12.5, marginTop: 3 }}>
                      <span style={{ color: T.green }}>+{s.entrees} {t('entrees')}</span>
                      <span style={{ color: T.muted }}> · </span>
                      <span style={{ color: T.red }}>−{s.sorties} {t('sorties')}</span>
                    </span>
                  )}
                </span>
              ) : (
              <>
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
              </>
              )}
              <span className="sc-num" style={{
                fontSize: mobile ? 18 : 13, fontWeight: 700, minWidth: 46, textAlign: 'right',
                color: s.net > 0 ? T.green : s.net < 0 ? T.red : T.muted,
              }}>
                {s.net > 0 ? '+' : ''}{s.net}
              </span>
            </button>

            {ouvert && mobile && (
              <div>
                {s.mouvements.map(m => {
                  const connu = m.qty_before !== null && m.qty_after !== null;
                  return (
                    <div key={m.id} className="sh-mvt">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Link href={`/admin/produits/${m.product_id}`} className="sh-mvt-nom">
                          {nomDe(m.product_id) || m.nom}
                        </Link>
                        <div className="sh-mvt-sub sc-num">
                          {connu
                            ? <>{t('avant')} {m.qty_before} → {t('apres')} <span style={{ color: T.ink }}>{m.qty_after}</span></>
                            : t('inconnu')}
                          {m.reason ? ` · ${m.reason}` : ''}
                        </div>
                        {m.note && <div className="sh-mvt-sub">{m.note}</div>}
                      </div>
                      <span className="sc-num" style={{ fontSize: 17, fontWeight: 700, color: m.delta > 0 ? T.green : T.red }}>
                        {m.delta > 0 ? '+' : ''}{m.delta}
                      </span>
                    </div>
                  );
                })}
                {s.mouvements.some(m => m.qty_before === null) && (
                  <div style={{ padding: '10px 15px', background: '#FDF6EA', fontSize: 12.5, color: '#8A5B08' }}>
                    {t('ancienFormat')}
                  </div>
                )}
              </div>
            )}

            {ouvert && !mobile && (
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

      {toast && <div className="sc-toast" role="status">{toast}</div>}
    </>
  );
}
