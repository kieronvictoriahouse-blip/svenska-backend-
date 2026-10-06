'use client';
import { useEffect, useState } from 'react';
import { adminFetch } from '@/lib/auth-client';
import { T } from '@/lib/admin-theme';
import { useT } from '@/lib/admin-i18n';

/* ═══════════════════════════════════════════════════════════════
   RÉGLAGES → PAIEMENTS

   Le marchand branche SON compte Stripe : il colle sa clé secrète, la
   boutique la vérifie, crée son webhook et la fait poser par l'usine
   Vendd (cf. /api/admin/paiements). Sur une boutique non gérée par
   l'usine, l'écran se contente d'afficher l'état.
   ═══════════════════════════════════════════════════════════════ */

const TPA = {
  titre:       { fr: 'Paiements', en: 'Payments', sv: 'Betalningar' },
  sousTitre:   { fr: 'Vos ventes sont encaissées directement sur votre propre compte Stripe.', en: 'Your sales are paid directly into your own Stripe account.', sv: 'Din försäljning betalas direkt till ditt eget Stripe-konto.' },
  etat:        { fr: 'État', en: 'Status', sv: 'Status' },
  branche:     { fr: 'Paiements branchés', en: 'Payments connected', sv: 'Betalningar anslutna' },
  nonBranche:  { fr: 'Paiements non branchés : la boutique ne peut pas encaisser.', en: 'Payments not connected: the shop cannot take payments.', sv: 'Betalningar ej anslutna: butiken kan inte ta betalt.' },
  modeTest:    { fr: 'Mode TEST — aucun vrai paiement', en: 'TEST mode — no real payments', sv: 'TESTLÄGE — inga riktiga betalningar' },
  modeLive:    { fr: 'Mode réel', en: 'Live mode', sv: 'Skarpt läge' },
  compte:      { fr: 'Compte', en: 'Account', sv: 'Konto' },
  encaisse:    { fr: 'Encaissement', en: 'Charges', sv: 'Betalningar' },
  versements:  { fr: 'Versements', en: 'Payouts', sv: 'Utbetalningar' },
  actif:       { fr: 'actif', en: 'enabled', sv: 'aktiva' },
  inactif:     { fr: 'à activer dans Stripe', en: 'to enable in Stripe', sv: 'aktivera i Stripe' },
  webhook:     { fr: 'Notifications de paiement (webhook)', en: 'Payment notifications (webhook)', sv: 'Betalningsaviseringar (webhook)' },
  ok:          { fr: 'configurées', en: 'configured', sv: 'konfigurerade' },
  manquant:    { fr: 'manquantes', en: 'missing', sv: 'saknas' },
  brancher:    { fr: 'Brancher mon compte Stripe', en: 'Connect my Stripe account', sv: 'Anslut mitt Stripe-konto' },
  remplacer:   { fr: 'Remplacer la clé', en: 'Replace the key', sv: 'Byt nyckel' },
  aide:        { fr: 'Dans Stripe : Développeurs → Clés API → « Clé secrète » (sk_live_… pour encaisser pour de vrai, sk_test_… pour essayer).', en: 'In Stripe: Developers → API keys → “Secret key” (sk_live_… for real payments, sk_test_… to try).', sv: 'I Stripe: Utvecklare → API-nycklar → ”Hemlig nyckel” (sk_live_… för riktiga betalningar, sk_test_… för att testa).' },
  placeholder: { fr: 'sk_live_…', en: 'sk_live_…', sv: 'sk_live_…' },
  envoyer:     { fr: 'Vérifier et enregistrer', en: 'Verify and save', sv: 'Verifiera och spara' },
  enCours:     { fr: 'Vérification auprès de Stripe…', en: 'Checking with Stripe…', sv: 'Kontrollerar med Stripe…' },
  securite:    { fr: 'La clé est vérifiée puis transmise de façon chiffrée à votre hébergement. Elle n’est jamais enregistrée en base, ni affichée.', en: 'The key is verified then sent encrypted to your hosting. It is never stored in the database, nor displayed.', sv: 'Nyckeln verifieras och skickas krypterat till din hosting. Den lagras aldrig i databasen och visas aldrig.' },
  nonGeree:    { fr: 'Cette boutique n’est pas gérée par l’usine Vendd : ses clés Stripe se règlent dans les variables Vercel.', en: 'This shop is not managed by the Vendd platform: its Stripe keys are set in the Vercel variables.', sv: 'Den här butiken hanteras inte av Vendd-plattformen: dess Stripe-nycklar ställs in i Vercel-variablerna.' },
  chargement:  { fr: 'Chargement…', en: 'Loading…', sv: 'Laddar…' },
};

type Etat = {
  branche: boolean; mode: 'live' | 'test' | null; webhook: boolean; erreur: string | null;
  compte: { nom: string; pays: string | null; encaissement_actif: boolean; versements_actifs: boolean } | null;
  geree_par_vendd: boolean; url_webhook: string;
};

export default function PaiementsPage() {
  const { t } = useT(TPA);
  const [etat, setEtat] = useState<Etat | null>(null);
  const [ouvert, setOuvert] = useState(false);
  const [cle, setCle] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null);

  const charger = () => adminFetch('/api/admin/paiements').then(r => r.json()).then(setEtat).catch(() => {});
  useEffect(() => { charger(); }, []);

  async function enregistrer() {
    setEnvoi(true); setRetour(null);
    try {
      const r = await adminFetch('/api/admin/paiements', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret_key: cle.trim() }),
      });
      const d = await r.json();
      setRetour({ ok: r.ok, texte: r.ok ? d.message : d.error });
      if (r.ok) { setCle(''); setOuvert(false); }
    } finally {
      setEnvoi(false);
    }
  }

  const ligne = (label: string, valeur: React.ReactNode, couleur?: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '7px 0', borderBottom: `1px solid ${T.border}`, fontSize: 13 }}>
      <span style={{ color: T.muted }}>{label}</span>
      <b style={{ color: couleur || T.ink, textAlign: 'right' }}>{valeur}</b>
    </div>
  );

  return (
    <div style={{ maxWidth: 680 }}>
      <p style={{ color: T.muted, fontSize: 13, margin: '0 0 18px' }}>{t('sousTitre')}</p>

      <div className="sc-card" style={{ padding: '14px 16px' }}>
        {!etat ? <div style={{ color: T.muted }}>{t('chargement')}</div> : (
          <>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6, color: etat.branche && !etat.erreur ? T.green : T.red }}>
              {etat.branche && !etat.erreur ? `✓ ${t('branche')}` : t('nonBranche')}
            </div>
            {etat.mode === 'test' && (
              <div style={{ background: '#FFF4E5', color: '#8A5B08', padding: '6px 10px', borderRadius: 6, fontSize: 12, marginBottom: 8 }}>{t('modeTest')}</div>
            )}
            {etat.compte && ligne(t('compte'), `${etat.compte.nom}${etat.compte.pays ? ' · ' + etat.compte.pays : ''}${etat.mode === 'live' ? ' · ' + t('modeLive') : ''}`)}
            {etat.compte && ligne(t('encaisse'), etat.compte.encaissement_actif ? t('actif') : t('inactif'), etat.compte.encaissement_actif ? T.green : '#C97A2B')}
            {etat.compte && ligne(t('versements'), etat.compte.versements_actifs ? t('actif') : t('inactif'), etat.compte.versements_actifs ? T.green : '#C97A2B')}
            {etat.branche && ligne(t('webhook'), etat.webhook ? t('ok') : t('manquant'), etat.webhook ? T.green : T.red)}
            {etat.erreur && <div style={{ color: T.red, fontSize: 12, marginTop: 8 }}>{etat.erreur}</div>}

            {!etat.geree_par_vendd ? (
              <div style={{ fontSize: 12, color: T.muted, marginTop: 12 }}>{t('nonGeree')}</div>
            ) : !ouvert ? (
              <button className="sc-btn sc-btn-primary" style={{ marginTop: 14 }} onClick={() => { setOuvert(true); setRetour(null); }}>
                {etat.branche ? t('remplacer') : t('brancher')}
              </button>
            ) : (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 12, color: T.text2, marginBottom: 8, lineHeight: 1.5 }}>{t('aide')}</div>
                <input className="sc-input" type="password" autoComplete="off" spellCheck={false}
                       placeholder={t('placeholder')} value={cle} onChange={e => setCle(e.target.value)} />
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button className="sc-btn sc-btn-primary" disabled={envoi || cle.trim().length < 20} onClick={enregistrer}>
                    {envoi ? t('enCours') : t('envoyer')}
                  </button>
                </div>
                <div style={{ fontSize: 11, color: T.muted, marginTop: 8 }}>🔒 {t('securite')}</div>
              </div>
            )}
            {retour && (
              <div style={{ marginTop: 12, padding: '8px 10px', borderRadius: 6, fontSize: 12.5,
                            background: retour.ok ? '#E9F0E6' : '#FBE7E4', color: retour.ok ? T.green : T.red }}>
                {retour.texte}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
