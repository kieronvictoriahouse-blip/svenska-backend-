'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminFetch } from '@/lib/auth-client';
import { T, BADGE, BadgeTone, eur } from '@/lib/admin-theme';

/* ═══════════════════════════════════════════════════════════════
   PANIERS EN COURS  ·  /admin/paniers

   Ce que les visiteurs du site mettent dans leur panier, en direct
   (rafraîchi toutes les 15 s). Le site envoie un instantané anonyme à
   chaque changement et à chaque page vue (/api/paniers/live) ; quand le
   client passe au paiement, le panier est rattaché à sa commande et on
   suit son statut ici.

   Anonyme : « Visiteur » + un fragment de l'identifiant aléatoire du
   navigateur. Rien ne désigne la personne avant qu'elle paie.
   ═══════════════════════════════════════════════════════════════ */

type Article = { id: string; qty: number; name: string; price: number; photo: string | null };
type Panier = {
  sid: string; items: Article[]; nb: number; total: number; page: string | null; lang: string | null; mobile: boolean | null;
  created_at: string; updated_at: string;
  commande: { order_number: string; status: string; total: number } | null;
};

const PAYE = ['paid', 'confirmed', 'preparing', 'partial', 'shipped', 'delivered'];
const FRONT = (process.env.NEXT_PUBLIC_FRONT_URL || 'https://www.swedishcravings.fr').replace(/\/$/, '');
const photo = (p: string | null) => (!p ? null : p.startsWith('/') ? FRONT + p : p);

function ilYa(iso: string, maintenant: number) {
  const s = Math.max(0, Math.round((maintenant - +new Date(iso)) / 1000));
  if (s < 60) return 'à l’instant';
  const m = Math.round(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h ${String(m % 60).padStart(2, '0')}`;
  return new Date(iso).toLocaleString('fr-FR', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
}

function etat(p: Panier, maintenant: number): { label: string; tone: BadgeTone; vivant: boolean } {
  const min = (maintenant - +new Date(p.updated_at)) / 60000;
  if (p.commande) {
    if (PAYE.includes(p.commande.status)) return { label: `Payé · ${p.commande.order_number}`, tone: 'green', vivant: false };
    if (p.commande.status === 'pending') return { label: 'Au paiement', tone: 'blue', vivant: min < 30 };
    return { label: 'Paiement abandonné', tone: 'red', vivant: false };
  }
  if (min < 5) return { label: 'Actif maintenant', tone: 'green', vivant: true };
  if (min < 60) return { label: 'Actif récemment', tone: 'amber', vivant: false };
  return { label: 'Inactif', tone: 'gray', vivant: false };
}

const PAGES: Record<string, string> = { '/': 'accueil', '/panier': 'panier', '/panier.html': 'panier', '/boutique': 'boutique', '/boutique.html': 'boutique' };
const nomPage = (p: string | null) => (!p ? '' : PAGES[p] || (p.startsWith('/produit') ? 'fiche produit' : p.replace(/^\//, '').replace(/\.html$/, '')));

const CSS = `
  .pc-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-bottom: 14px; }
  .pc-kpi { padding: 14px 16px; }
  .pc-kpi-l { font-size: 12px; font-weight: 600; letter-spacing: .5px; text-transform: uppercase; color: ${T.text3}; }
  .pc-kpi-v { font-size: 26px; font-weight: 700; margin-top: 4px; color: ${T.ink}; font-variant-numeric: tabular-nums; }
  .pc-list { display: flex; flex-direction: column; gap: 10px; }
  .pc-carte { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 14px; padding: 14px 16px; align-items: center; }
  .pc-tete { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 13px; color: ${T.text2}; }
  .pc-pastille { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; padding: 3px 9px; border-radius: 999px; }
  .pc-point { width: 8px; height: 8px; border-radius: 50%; background: currentColor; }
  .pc-vivant .pc-point { animation: pc-pulse 1.6s ease-in-out infinite; }
  @keyframes pc-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .25; } }
  .pc-articles { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
  .pc-art { display: flex; align-items: center; gap: 8px; background: ${T.surfaceAlt}; border: 1px solid ${T.borderFaint2}; border-radius: 8px; padding: 4px 10px 4px 4px; font-size: 13px; max-width: 280px; }
  .pc-art img, .pc-art .ph { width: 32px; height: 32px; object-fit: contain; border-radius: 6px; background: #F1EADC; flex-shrink: 0; }
  .pc-art span.n { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pc-total { font-size: 22px; font-weight: 700; text-align: right; font-variant-numeric: tabular-nums; }
  .pc-filtres { display: flex; gap: 6px; }
  .pc-filtres button[aria-pressed="true"] { background: ${T.ink}; color: #fff; border-color: ${T.ink}; }
  @media (max-width: 899px) {
    .pc-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .pc-carte { grid-template-columns: 1fr; }
    .pc-total { text-align: left; }
  }
  @media (prefers-reduced-motion: reduce) { .pc-vivant .pc-point { animation: none; } }
`;

export default function PaniersEnCours() {
  const [paniers, setPaniers] = useState<Panier[]>([]);
  const [h, setH] = useState(24);
  const [maj, setMaj] = useState<number>(0);
  const [maintenant, setMaintenant] = useState(Date.now());
  const [migration, setMigration] = useState<string | null>(null);
  const [charge, setCharge] = useState(true);

  const charger = useCallback(async () => {
    try {
      const d = await adminFetch(`/api/admin/paniers?h=${h}`).then(r => r.json());
      setPaniers(d.paniers || []);
      setMigration(d.migration || null);
      setMaj(Date.now());
    } catch { /* réseau : on garde l'affichage */ }
    setCharge(false);
  }, [h]);

  useEffect(() => { setCharge(true); charger(); const t = setInterval(charger, 15000); return () => clearInterval(t); }, [charger]);
  useEffect(() => { const t = setInterval(() => setMaintenant(Date.now()), 5000); return () => clearInterval(t); }, []);

  const k = useMemo(() => {
    const actifs = paniers.filter(p => !p.commande && (maintenant - +new Date(p.updated_at)) < 15 * 60000);
    const paiement = paniers.filter(p => p.commande);
    const payes = paiement.filter(p => PAYE.includes(p.commande!.status));
    const enJeu = paniers.filter(p => !p.commande || !PAYE.includes(p.commande.status)).reduce((s, p) => s + p.total, 0);
    return { actifs: actifs.length, total: paniers.length, paiement: paiement.length, payes: payes.length, enJeu };
  }, [paniers, maintenant]);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="sc-head">
        <div>
          <div className="sc-title">Paniers en cours</div>
          <div className="sc-sub">
            Ce que les visiteurs mettent dans leur panier, en direct · mis à jour {maj ? ilYa(new Date(maj).toISOString(), maintenant) : '…'}
          </div>
        </div>
        <div className="pc-filtres">
          {[[2, '2 h'], [24, '24 h'], [168, '7 jours']].map(([v, l]) => (
            <button key={v} className="sc-btn sc-btn-secondary" aria-pressed={h === v} onClick={() => setH(v as number)}>{l}</button>
          ))}
        </div>
      </div>

      {migration && (
        <div className="sc-card sc-card-pad" style={{ marginBottom: 14, background: BADGE.amber.bg, color: BADGE.amber.fg, borderColor: 'transparent' }}>
          La table des paniers n’existe pas encore : passer la migration {migration} (supabase/migrations/069_paniers_en_cours.sql) dans le SQL Editor de Supabase.
        </div>
      )}

      <div className="pc-kpis">
        {[
          ['En ce moment', String(k.actifs)],
          [h === 2 ? 'Paniers (2 h)' : h === 24 ? 'Paniers (24 h)' : 'Paniers (7 j)', String(k.total)],
          ['Passés au paiement', `${k.paiement} · ${k.payes} payé${k.payes > 1 ? 's' : ''}`],
          ['Montant pas encore payé', eur(k.enJeu)],
        ].map(([l, v]) => (
          <div key={l} className="sc-card pc-kpi">
            <div className="pc-kpi-l">{l}</div>
            <div className="pc-kpi-v">{v}</div>
          </div>
        ))}
      </div>

      <div className="pc-list">
        {!charge && !paniers.length && !migration && (
          <div className="sc-card sc-card-pad" style={{ textAlign: 'center', color: T.text3, padding: 40 }}>
            Aucun panier sur cette période. Les paniers apparaissent ici dès qu’un visiteur ajoute un article.
          </div>
        )}
        {paniers.map(p => {
          const e = etat(p, maintenant);
          const ton = BADGE[e.tone];
          return (
            <div key={p.sid} className="sc-card pc-carte">
              <div style={{ minWidth: 0 }}>
                <div className="pc-tete">
                  <span className={`pc-pastille${e.vivant ? ' pc-vivant' : ''}`} style={{ background: ton.bg, color: ton.fg }}>
                    <span className="pc-point" aria-hidden="true" />{e.label}
                  </span>
                  <span style={{ fontWeight: 600, color: T.ink }}>Visiteur {p.sid.slice(0, 6)}</span>
                  <span>
                    <span className="ms" style={{ fontSize: 15, verticalAlign: -3 }} aria-hidden="true">{p.mobile ? 'smartphone' : 'computer'}</span>
                    {' '}{p.mobile ? 'mobile' : 'ordinateur'}{p.lang && p.lang !== 'fr' ? ` · ${p.lang.toUpperCase()}` : ''}
                  </span>
                  <span>· {ilYa(p.updated_at, maintenant)}{p.page ? ` · sur ${nomPage(p.page)}` : ''}</span>
                  <span style={{ color: T.muted }}>· panier commencé {ilYa(p.created_at, maintenant)}</span>
                </div>
                <div className="pc-articles">
                  {p.items.map(a => (
                    <div key={a.id} className="pc-art" title={`${a.qty} × ${a.name} — ${eur(a.price)}`}>
                      {photo(a.photo) ? <img src={photo(a.photo)!} alt="" /> : <span className="ph" />}
                      <b>{a.qty}×</b><span className="n">{a.name}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="pc-total">{eur(p.total)}</div>
                <div style={{ fontSize: 13, color: T.text3, textAlign: 'right' }}>{p.nb} article{p.nb > 1 ? 's' : ''}</div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
