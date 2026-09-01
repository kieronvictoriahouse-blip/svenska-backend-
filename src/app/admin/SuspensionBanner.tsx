'use client';
import { useEffect, useState } from 'react';
import type { AdminLang } from '@/lib/admin-i18n';

/* ═══════════════════════════════════════════════════════════════
   BANNIÈRE DE SUSPENSION — visible sur TOUT l'admin quand
   SHOPFLOW_SUSPENDED=1 est posé par le control plane.

   Autonome à dessein : AdminShell est présentationnel (contrat du
   harnais visuel), donc la bannière porte son propre fetch et rend
   null quand tout va bien — ou quand le fetch échoue (harnais,
   hors-ligne). Elle informe, elle n'empêche rien : c'est le
   middleware qui coupe, pas elle.
   ═══════════════════════════════════════════════════════════════ */

const TEXTES: Record<AdminLang, string> = {
  fr: 'Boutique suspendue — abonnement Shopflow à régulariser. Vos données sont intactes ; la vente et les écritures sont coupées, la réactivation est immédiate après régularisation.',
  en: 'Shop suspended — Shopflow subscription needs to be settled. Your data is intact; sales and writes are paused, reactivation is immediate once settled.',
  sv: 'Butiken är avstängd — Shopflow-prenumerationen behöver regleras. Dina data är intakta; försäljning och ändringar är pausade, återaktivering sker direkt efter reglering.',
};

export default function SuspensionBanner({ lang }: { lang: AdminLang }) {
  const [suspendu, setSuspendu] = useState(false);

  useEffect(() => {
    let vivant = true;
    fetch('/api/public-config', { cache: 'no-store' })
      .then(r => r.json())
      .then(cfg => { if (vivant && cfg?.suspendu === true) setSuspendu(true); })
      .catch(() => {});
    return () => { vivant = false; };
  }, []);

  if (!suspendu) return null;
  return (
    <div role="alert" style={{
      background: '#b91c1c', color: '#fff', padding: '10px 16px',
      fontSize: 13, fontWeight: 600, lineHeight: 1.4, textAlign: 'center',
    }}>
      {TEXTES[lang] || TEXTES.fr}
    </div>
  );
}
