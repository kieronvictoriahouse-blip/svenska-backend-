'use client';
import { useState } from 'react';

/* Page d'inscription — volontairement sobre : la vitrine marketing de
   Shopflow viendra après le pilote. Ceci est le TUNNEL, et il marche. */

export default function Accueil() {
  const [form, setForm] = useState({ nom_boutique: '', email: '', siren: '', sous_domaine: '' });
  const [etat, setEtat] = useState<{ envoi?: boolean; erreur?: string; ok?: string }>({});

  const maj = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  async function envoyer(e: React.FormEvent) {
    e.preventDefault();
    setEtat({ envoi: true });
    try {
      const r = await fetch('/api/inscription', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok) { setEtat({ erreur: d.error || 'Erreur' }); return; }
      if (d.url) { window.location.href = d.url; return; }        // Stripe Checkout
      setEtat({ ok: d.message || 'Inscription enregistrée — votre boutique arrive.' });
    } catch { setEtat({ erreur: 'Connexion impossible, réessayez.' }); }
  }

  return (
    <main style={{ maxWidth: 520, margin: '0 auto', padding: '64px 20px', fontFamily: 'Jost, system-ui, sans-serif', color: '#1B2118' }}>
      <div style={{ fontSize: 13, letterSpacing: '.3em', textTransform: 'uppercase', color: '#4E6651' }}>Shopflow</div>
      <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 34, margin: '10px 0 6px' }}>
        Votre boutique en ligne complète, en dix minutes.
      </h1>
      <p style={{ color: '#5F5A4E', lineHeight: 1.6, margin: '0 0 30px' }}>
        Vitrine trilingue, gestion de stock tracée, préparation au scan, factures
        électroniques Factur-X inaltérables, livre des recettes — conforme aux
        obligations 2026/2027 des micro-entrepreneurs. Vos données dans votre
        propre base, exportables intégralement.
      </p>

      <form onSubmit={envoyer} style={{ display: 'grid', gap: 14 }}>
        {[
          ['nom_boutique', 'Nom de votre boutique', 'Fromagerie Dupont'],
          ['email', 'Votre email', 'jean@dupont.fr'],
          ['siren', 'SIREN (9 chiffres)', '123456789'],
          ['sous_domaine', 'Adresse souhaitée', 'fromagerie-dupont'],
        ].map(([k, label, ph]) => (
          <label key={k} style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>
            {label}
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                value={(form as any)[k]}
                onChange={e => maj(k, e.target.value)}
                placeholder={ph}
                required={k !== 'siren'}
                style={{
                  flex: 1, height: 42, padding: '0 12px', fontSize: 14,
                  border: '1px solid #D8CEBC', borderRadius: 8, background: '#FDFBF7',
                }} />
              {k === 'sous_domaine' && <span style={{ fontSize: 13, color: '#8B8371' }}>.shopflow.fr</span>}
            </span>
          </label>
        ))}

        <button type="submit" disabled={etat.envoi} style={{
          height: 48, border: 'none', borderRadius: 8, background: '#1B2118', color: '#F4EEE1',
          fontSize: 15, fontWeight: 600, cursor: 'pointer', marginTop: 6,
        }}>
          {etat.envoi ? 'Un instant…' : 'Créer ma boutique — essai 14 jours'}
        </button>
      </form>

      {etat.erreur && <p style={{ color: '#B03A2E', marginTop: 14 }}>{etat.erreur}</p>}
      {etat.ok && <p style={{ color: '#3E7A4E', marginTop: 14 }}>{etat.ok}</p>}

      <p style={{ fontSize: 12, color: '#8B8371', marginTop: 34, lineHeight: 1.6 }}>
        Chaque boutique dispose de sa propre base de données, isolée. Résiliable à
        tout moment, avec export complet de vos données. Vos encaissements vont sur
        votre propre compte Stripe — jamais par nous.
      </p>
    </main>
  );
}
