'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>🇸🇪</div>
          <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '24px', fontWeight: 600, color: '#1C2028' }}>
            Svenska Delikatessen
          </div>
          <div style={{ fontSize: '11px', letterSpacing: '3px', textTransform: 'uppercase', color: '#BC7455', marginTop: '4px' }}>
            Administration
          </div>
        </div>

        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label className="form-label">Adresse e-mail</label>
            <input
              type="email" className="form-control"
              value={email} onChange={e => setEmail(e.target.value)}
              placeholder="admin@svenska-delikatessen.com"
              required autoFocus
            />
          </div>
          <div className="form-group">
            <label className="form-label">Mot de passe</label>
            <input
              type="password" className="form-control"
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
          <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '12px' }} disabled={loading}>
            {loading ? '⏳ Connexion...' : '→ Se connecter'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: '11px', color: '#9E8E78', marginTop: '24px' }}>
          Accès réservé aux administrateurs Svenska Delikatessen
        </p>
      </div>
    </div>
  );
}
