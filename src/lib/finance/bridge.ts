// ─────────────────────────────────────────────────────────────────────
//  Adaptateur Bridge (bridgeapi.io, ex-Budget Insight) — agrégation PSD2
//
//  Auth : en-têtes applicatifs Client-Id / Client-Secret + Bridge-Version,
//  puis un jeton utilisateur (Bearer) pour les appels agrégation.
//  Bridge est « user-centric » : une instance = un utilisateur Bridge.
//  La page Connect de Bridge gère elle-même le choix de la banque, donc
//  pas de picker d'institutions à coder.
//
//  Secrets (env) :
//    BRIDGE_CLIENT_ID
//    BRIDGE_CLIENT_SECRET
//    BRIDGE_VERSION           (optionnel, défaut « 2025-01-15 »)
//    BRIDGE_USER_EMAIL        (email de contact end-user, requis par Bridge)
//
//  Réf. : https://docs.bridgeapi.io  (v3 /aggregation/*).
// ─────────────────────────────────────────────────────────────────────

const BASE = 'https://api.bridgeapi.io';

export function bridgeConfigured(): boolean {
  return !!(process.env.BRIDGE_CLIENT_ID && process.env.BRIDGE_CLIENT_SECRET);
}

function appHeaders(): Record<string, string> {
  return {
    'Client-Id': process.env.BRIDGE_CLIENT_ID || '',
    'Client-Secret': process.env.BRIDGE_CLIENT_SECRET || '',
    'Bridge-Version': process.env.BRIDGE_VERSION || '2025-01-15',
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

async function br<T = any>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, ...rest } = init;
  const headers: Record<string, string> = { ...appHeaders(), ...(rest.headers as any || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { ...rest, headers, cache: 'no-store' });
  if (!res.ok) throw new Error(`Bridge ${path}: ${res.status} ${await res.text()}`);
  if (res.status === 204) return {} as T;
  return res.json();
}

// ── Utilisateur (une instance = un utilisateur Bridge) ────────────────
export async function ensureBridgeUser(externalUserId: string): Promise<string> {
  // Tente de créer ; si déjà existant, Bridge renvoie une erreur qu'on ignore
  // au profit d'une recherche par external_user_id.
  try {
    const u = await br<{ uuid: string }>('/v3/aggregation/users', {
      method: 'POST', body: JSON.stringify({ external_user_id: externalUserId }),
    });
    if (u.uuid) return u.uuid;
  } catch { /* probablement déjà créé */ }
  const list = await br<{ resources: { uuid: string; external_user_id: string }[] }>('/v3/aggregation/users');
  const found = (list.resources || []).find(u => u.external_user_id === externalUserId);
  if (!found) throw new Error('Utilisateur Bridge introuvable après création');
  return found.uuid;
}

// Jeton utilisateur (mis en cache en mémoire).
const _tokens: Record<string, { token: string; exp: number }> = {};
export async function bridgeUserToken(userUuid: string): Promise<string> {
  const c = _tokens[userUuid];
  if (c && c.exp > Date.now() + 60_000) return c.token;
  const r = await br<{ access_token: string; expires_at: string }>('/v3/aggregation/authorization/token', {
    method: 'POST', body: JSON.stringify({ user_uuid: userUuid }),
  });
  _tokens[userUuid] = { token: r.access_token, exp: new Date(r.expires_at).getTime() };
  return r.access_token;
}

// ── Session de connexion (renvoie l'URL de la page Connect) ───────────
export async function createBridgeConnectSession(userUuid: string, callbackUrl: string): Promise<{ url: string; id: string }> {
  const token = await bridgeUserToken(userUuid);
  const r = await br<{ url: string; id: string }>('/v3/aggregation/connect-sessions', {
    method: 'POST', token,
    body: JSON.stringify({
      user_email: process.env.BRIDGE_USER_EMAIL || 'compta@shopflow.app',
      callback_url: callbackUrl,
      country_code: 'FR',
    }),
  });
  return r;
}

// ── Comptes & transactions ────────────────────────────────────────────
export interface BridgeAccount {
  id: number; name: string; balance: number; currency_code: string;
  type?: string; iban?: string; item_id?: number; updated_at?: string;
}
export async function listBridgeAccounts(userUuid: string): Promise<BridgeAccount[]> {
  const token = await bridgeUserToken(userUuid);
  const r = await br<{ resources: BridgeAccount[] }>('/v3/aggregation/accounts', { token });
  return r.resources || [];
}

export interface BridgeTransaction {
  id: number; amount: number; date: string; currency_code: string;
  clean_description?: string; provider_description?: string; description?: string;
  account_id: number; updated_at?: string; deleted?: boolean;
}
export async function listBridgeTransactions(userUuid: string, sinceIso?: string): Promise<BridgeTransaction[]> {
  const token = await bridgeUserToken(userUuid);
  const out: BridgeTransaction[] = [];
  let uri: string | null = `/v3/aggregation/transactions?limit=500${sinceIso ? `&since=${sinceIso}` : ''}`;
  let guard = 0;
  while (uri && guard++ < 20) {
    const r: { resources: BridgeTransaction[]; pagination?: { next_uri: string | null } } =
      await br(uri, { token });
    out.push(...(r.resources || []));
    uri = r.pagination?.next_uri || null;
  }
  return out.filter(t => !t.deleted);
}

export function bridgeLabel(t: BridgeTransaction): string {
  return (t.clean_description || t.provider_description || t.description || 'Opération bancaire').trim();
}
