'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

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
      localStorage.setItem('sd_admin_email', data.user.email);
      router.push('/admin');
    } catch {
      setError('Connexion impossible — vérifiez votre réseau.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#1C2028',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px',
    }}>
      <div style={{
        background: 'white', borderRadius: '8px', padding: '48px',
        width: '100%', maxWidth: '420px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          {logoUrl ? (
            <img src={logoUrl} alt={siteName} style={{ height: '48px', marginBottom: '12px', objectFit: 'contain' }} />
          ) : (
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>🏪</div>
          )}
          {siteName && (
            <div style={{ fontFamily: 'Georgia, serif', fontSize: '24px', fontWeight: 600, color: '#1C2028' }}>
              {siteName}
            </div>
          )}
          <div style={{ fontSize: '11px', letterSpacing: '3px', textTransform: 'uppercase', color: '#9E8E78', marginTop: '4px' }}>
            Administration
          </div>
        </div>

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#5A5248', marginBottom: '6px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
              Adresse e-mail
            </label>
            <input
              type="email"
              style={{ width: '100%', padding: '10px 14px', border: '1.5px solid #E8E4DE', borderRadius: '8px', fontSize: '14px', color: '#1C2028', outline: 'none' }}
              value={email} onChange={e => setEmail(e.target.value)}
              placeholder="admin@exemple.com"
              required autoFocus
            />
          </div>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#5A5248', marginBottom: '6px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
              Mot de passe
            </label>
            <input
              type="password"
              style={{ width: '100%', padding: '10px 14px', border: '1.5px solid #E8E4DE', borderRadius: '8px', fontSize: '14px', color: '#1C2028', outline: 'none' }}
              value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>
          {error && (
            <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '10px 14px', borderRadius: '6px', fontSize: '13px', marginBottom: '16px' }}>
              ⚠️ {error}
            </div>
          )}
          <button
            type="submit"
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px', background: colorPrimary, color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}
            disabled={loading}
          >
            {loading ? '⏳ Connexion...' : '→ Se connecter'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: '11px', color: '#9E8E78', marginTop: '24px' }}>
          Accès réservé aux administrateurs
        </p>
      </div>
    </div>
  );
}
