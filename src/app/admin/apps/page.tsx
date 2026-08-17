'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminFetch } from '@/lib/auth-client';
import { T, BADGE, initials } from '@/lib/admin-theme';
import { useT } from '@/lib/admin-i18n';
import { TAP } from './i18n';

/* ═══════════════════════════════════════════════════════════════
   ÉCRAN 20 — PARAMÈTRES
   Handoff §20 : grille de 6 blocs cliquables (icône dans un carré
   accent, titre, résumé de la configuration actuelle, chevron), puis
   la carte « Accès & utilisateurs ».
   Les résumés affichent la configuration réelle, pas des libellés figés.
   ═══════════════════════════════════════════════════════════════ */

type Cfg = Record<string, any>;

export default function ParametresPage() {
  const { t, tc, lang } = useT(TAP);
  const [cfg, setCfg] = useState<Cfg>({});
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setEmail(localStorage.getItem('sd_admin_email') || '');
    adminFetch('/api/white-label')
      .then(r => r.json())
      .then(d => setCfg(d.config || {}))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const shipPromo = cfg.ship_promo_active === true;
  const franco = Number(cfg.free_shipping_threshold) > 0 ? Number(cfg.free_shipping_threshold) : 50;

  const BLOCKS = [
    {
      icon: 'storefront', title: 'Boutique',
      summary: [cfg.site_name || 'Swedish Cravings', cfg.address || 'Adresse non renseignée'].join(' · '),
      href: '/admin/white-label',
    },
    {
      icon: 'local_shipping', title: 'Livraison',
      summary: shipPromo
        ? `Opération en cours — franco dès ${cfg.ship_promo_threshold ?? '—'} €`
        : `Franco de port dès ${franco} € · 4,90 € en dessous`,
      href: '/admin/marketing?tab=promo',
    },
    {
      icon: 'credit_card', title: 'Paiement',
      summary: cfg.stripe_public_key ? 'Stripe connecté' : 'Stripe non configuré',
      href: '/admin/white-label',
    },
    {
      icon: 'percent', title: 'TVA & facturation',
      summary: cfg.siret ? `SIRET ${cfg.siret} · TVA non applicable (art. 293 B)` : 'SIRET non renseigné',
      href: '/admin/gestion',
    },
    {
      icon: 'mail', title: 'Emails transactionnels',
      summary: cfg.smtp_from || cfg.email || 'Expéditeur non configuré',
      href: '/admin/marketing',
    },
    {
      icon: 'language', title: 'Langues',
      summary: 'Français · Svenska · English',
      href: '/admin/home-cms',
    },
  ];

  return (
    <>
      <div className="sc-head">
        <div>
          <div className="sc-title">{t('titre')}</div>
          <div className="sc-sub">{t('sous')}</div>
        </div>
      </div>

      {loading && <div className="sc-empty">{tc('loading')}</div>}

      {!loading && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 10, marginBottom: 14 }}>
            {BLOCKS.map(b => (
              <Link key={b.title} href={b.href} className="sc-card"
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 15px', textDecoration: 'none' }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 9, flexShrink: 0,
                  background: 'color-mix(in srgb, var(--accent) 8%, transparent)', color: 'var(--accent)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span className="ms" style={{ fontSize: 19 }}>{b.icon}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>{b.title}</div>
                  <div style={{ fontSize: 11, color: T.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {b.summary}
                  </div>
                </div>
                <span className="ms" style={{ fontSize: 18, color: T.muted3 }}>chevron_right</span>
              </Link>
            ))}
          </div>

          <div className="sc-card">
            <div style={{ padding: '12px 15px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="sc-card-title">{t('acces')}</span>
              <span style={{ fontSize: 11.5, color: T.muted }}>{t('multiUtilisateurs')}</span>
            </div>
            <div style={{ padding: '13px 15px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                background: 'color-mix(in srgb, var(--accent) 10%, transparent)', color: 'var(--accent)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700,
              }}>{initials(email || 'AD')}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>{email.split('@')[0] || 'Administrateur'}</div>
                <div style={{ fontSize: 11, color: T.muted, wordBreak: 'break-all' }}>{email || '—'}</div>
              </div>
              <span className="sc-badge" style={{ background: BADGE.plum.bg, color: BADGE.plum.fg }}>{t('proprietaire')}</span>
            </div>
            <div style={{ padding: '11px 15px', borderTop: `1px solid ${T.borderFaint}`, background: T.surfaceAlt, fontSize: 11.5, color: T.muted }}>
              Le back-office fonctionne avec un compte unique. Inviter d’autres utilisateurs demanderait
              une table de comptes et une gestion de rôles — à ouvrir si le besoin se présente.
            </div>
          </div>
        </>
      )}
    </>
  );
}
