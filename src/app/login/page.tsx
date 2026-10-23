'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { T, BADGE, initials } from '@/lib/admin-theme';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [siteName, setSiteName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [colorPrimary, setColorPrimary] = useState('#1C2028');

  useEffect(() => {
    fetch('/api/white-label')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.config) {
          if (data.config.site_name) setSiteName(data.config.site_name);
          if (data.config.logo_url) setLogoUrl(data.config.logo_url);
          if (data.config.color_primary) setColorPrimary(data.config.color_primary);
        }
      })
      .catch(() => {});
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Erreur de connexion'); return; }
      localStorage.setItem('sd_admin_token', data.access_token);
      localStorage.setItem('sd_admin_refresh_token', data.refresh_token || '');
      localStorage.setItem('sd_admin_email', data.user.email);
      router.push('/admin');
    } catch {
      setError('Connexion impossible — vérifiez votre réseau.');
    } finally {
      setLoading(false);
    }
  }

  /* Téléphone : carte pleine largeur avec des marges raisonnables (48 px
     de padding mangeaient un quart de l'écran), champs à 16 px (sinon iOS
     zoome à la saisie), 48 px de haut, clavier et remplissage automatique
     adaptés (email, mot de passe actuel). */
  const css = `
    .lg-wrap { min-height: 100vh; min-height: 100dvh; background: ${T.ink}; display: flex; align-items: center; justify-content: center; padding: 24px; }
    .lg-card { background: #fff; border-radius: 8px; padding: 48px; width: 100%; max-width: 420px; box-shadow: 0 20px 60px rgba(0,0,0,.3); }
    .lg-label { display: block; font-size: 12px; font-weight: 700; color: ${T.text2}; margin-bottom: 6px; letter-spacing: .5px; text-transform: uppercase; }
    .lg-input { width: 100%; padding: 10px 14px; border: 1.5px solid ${T.borderField}; border-radius: 8px; font-size: 14px; color: ${T.ink}; outline: none; font-family: inherit; }
    .lg-input:focus { border-color: ${T.ink}; }
    .lg-btn { width: 100%; display: flex; align-items: center; justify-content: center; padding: 12px; color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; font-family: inherit; }
    @media (max-width: 599px) {
      .lg-wrap { padding: 16px; align-items: flex-start; padding-top: max(10vh, 24px); }
      .lg-card { padding: 28px 20px; border-radius: 12px; }
      .lg-input { font-size: 16px; min-height: 48px; }
      .lg-btn { min-height: 50px; font-size: 16px; }
      .lg-label { font-size: 12.5px; }
    }
  `;

  return (
    <div className="lg-wrap">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="lg-card">
        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          {logoUrl ? (
            <img src={logoUrl} alt={siteName} style={{ height: '48px', maxWidth: '100%', marginBottom: '12px', objectFit: 'contain' }} />
          ) : (
            <div aria-hidden="true" style={{
              width: 44, height: 44, borderRadius: 11, margin: '0 auto 10px', background: colorPrimary, color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, letterSpacing: .3,
            }}>{initials(siteName || 'Admin').slice(0, 2)}</div>
          )}
          {siteName && (
            <div style={{ fontFamily: 'Georgia, serif', fontSize: '24px', fontWeight: 600, color: T.ink, overflowWrap: 'anywhere' }}>
              {siteName}
            </div>
          )}
          <div style={{ fontSize: '12px', letterSpacing: '3px', textTransform: 'uppercase', color: T.muted, marginTop: '4px' }}>
            Administration
          </div>
        </div>

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: '16px' }}>
            <label className="lg-label" htmlFor="lg-email">
              Adresse e-mail
            </label>
            <input
              id="lg-email"
              type="email"
              className="lg-input"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              inputMode="email"
              value={email} onChange={e => setEmail(e.target.value)}
              placeholder="admin@exemple.com"
              required autoFocus
            />
          </div>
          <div style={{ marginBottom: '16px' }}>
            <label className="lg-label" htmlFor="lg-password">
              Mot de passe
            </label>
            <input
              id="lg-password"
              type="password"
              className="lg-input"
              autoComplete="current-password"
              value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>
          {error && (
            <div role="alert" style={{ background: BADGE.red.bg, color: T.red, padding: '10px 14px', borderRadius: '6px', fontSize: '13px', marginBottom: '16px' }}>
              {error}
            </div>
          )}
          <button
            type="submit"
            className="lg-btn"
            style={{ background: colorPrimary, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}
            disabled={loading}
          >
            {loading ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: '12px', color: T.muted, marginTop: '24px' }}>
          Accès réservé aux administrateurs
        </p>
      </div>
    </div>
  );
}
