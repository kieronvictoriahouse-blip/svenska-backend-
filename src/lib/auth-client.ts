let _refreshing: Promise<string> | null = null;

function tokenExpiresSoon(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000 < Date.now() + 60_000;
  } catch {
    return true;
  }
}

async function doRefresh(): Promise<string> {
  const rt = localStorage.getItem('sd_admin_refresh_token') || '';
  if (!rt) return '';
  try {
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: rt }),
    });
    if (!res.ok) return '';
    const data = await res.json();
    localStorage.setItem('sd_admin_token', data.access_token);
    if (data.refresh_token) localStorage.setItem('sd_admin_refresh_token', data.refresh_token);
    return data.access_token;
  } catch {
    return '';
  }
}

export async function getValidToken(): Promise<string> {
  const token = localStorage.getItem('sd_admin_token') || '';
  if (token && !tokenExpiresSoon(token)) return token;

  // Deduplicate concurrent refresh calls
  if (!_refreshing) _refreshing = doRefresh().finally(() => { _refreshing = null; });
  return _refreshing;
}

export async function adminFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = await getValidToken();
  const headers = new Headers(options.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  else headers.delete('Authorization');
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    // Token invalid even after refresh — session is dead
    localStorage.removeItem('sd_admin_token');
    localStorage.removeItem('sd_admin_refresh_token');
    window.location.replace('/login');
  }
  return res;
}
