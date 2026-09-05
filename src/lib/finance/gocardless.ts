// ─────────────────────────────────────────────────────────────────────
//  Client GoCardless Bank Account Data (ex-Nordigen)
//  Agrégation bancaire PSD2 — gratuite, banques FR/EU.
//
//  Secrets (Supabase/Vercel env) :
//    GOCARDLESS_SECRET_ID   — Secret ID du portail Bank Account Data
//    GOCARDLESS_SECRET_KEY  — Secret Key
//    APP_URL (ou NEXT_PUBLIC_APP_URL) — base publique pour l'URL de retour
//
//  Doc : https://bankaccountdata.gocardless.com/api/v2/  (Swagger).
// ─────────────────────────────────────────────────────────────────────

const BASE = 'https://bankaccountdata.gocardless.com/api/v2';

export function gocardlessConfigured(): boolean {
  return !!(process.env.GOCARDLESS_SECRET_ID && process.env.GOCARDLESS_SECRET_KEY);
}

export function appBaseUrl(): string {
  return (
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') ||
    'http://localhost:3001'
  ).replace(/\/$/, '');
}

// ── Jeton d'accès (mis en cache en mémoire, valide ~24 h) ─────────────
let _token: { access: string; exp: number } | null = null;

async function getToken(): Promise<string> {
  if (_token && _token.exp > Date.now() + 60_000) return _token.access;
  if (!gocardlessConfigured()) throw new Error('GoCardless non configuré (GOCARDLESS_SECRET_ID / GOCARDLESS_SECRET_KEY)');
  const res = await fetch(`${BASE}/token/new/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      secret_id: process.env.GOCARDLESS_SECRET_ID,
      secret_key: process.env.GOCARDLESS_SECRET_KEY,
    }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`GoCardless token: ${res.status} ${await res.text()}`);
  const data = await res.json();
  // access_expires est en secondes (~86400)
  _token = { access: data.access, exp: Date.now() + (data.access_expires || 86400) * 1000 };
  return _token.access;
}

async function gc<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init.headers || {}),
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GoCardless ${path}: ${res.status} ${body}`);
  }
  if (res.status === 204) return {} as T;
  return res.json();
}

// ── Types (partiels) ──────────────────────────────────────────────────
export interface GcInstitution {
  id: string; name: string; bic?: string; logo?: string;
  transaction_total_days?: string; countries?: string[];
}
export interface GcRequisition {
  id: string; status: string; link: string; accounts: string[];
  institution_id: string; reference: string;
}
export interface GcTransaction {
  transactionId?: string;
  internalTransactionId?: string;
  bookingDate?: string;
  valueDate?: string;
  transactionAmount: { amount: string; currency: string };
  remittanceInformationUnstructured?: string;
  remittanceInformationUnstructuredArray?: string[];
  creditorName?: string;
  debtorName?: string;
  additionalInformation?: string;
}

// ── Appels ────────────────────────────────────────────────────────────

export function listInstitutions(country = 'fr'): Promise<GcInstitution[]> {
  return gc<GcInstitution[]>(`/institutions/?country=${encodeURIComponent(country)}`);
}

/** Crée une requisition : renvoie le lien vers lequel rediriger l'utilisatrice. */
export async function createRequisition(institutionId: string, reference: string): Promise<GcRequisition> {
  return gc<GcRequisition>('/requisitions/', {
    method: 'POST',
    body: JSON.stringify({
      redirect: `${appBaseUrl()}/api/accounting/bank/callback`,
      institution_id: institutionId,
      reference,
      user_language: 'FR',
    }),
  });
}

export function getRequisition(id: string): Promise<GcRequisition> {
  return gc<GcRequisition>(`/requisitions/${id}/`);
}

export function getAccountMeta(accountId: string): Promise<any> {
  return gc(`/accounts/${accountId}/`);
}
export function getAccountDetails(accountId: string): Promise<any> {
  return gc(`/accounts/${accountId}/details/`);
}
export function getAccountBalances(accountId: string): Promise<any> {
  return gc(`/accounts/${accountId}/balances/`);
}
export function getAccountTransactions(accountId: string, dateFrom?: string): Promise<{ transactions: { booked: GcTransaction[]; pending: GcTransaction[] } }> {
  const q = dateFrom ? `?date_from=${dateFrom}` : '';
  return gc(`/accounts/${accountId}/transactions/${q}`);
}

/** Masque un IBAN : FR7612345678901234567890123 → « FR76 •••• 0123 ». */
export function maskIban(iban?: string): string {
  if (!iban) return '';
  const clean = iban.replace(/\s+/g, '');
  if (clean.length < 8) return clean;
  return `${clean.slice(0, 4)} •••• ${clean.slice(-4)}`;
}

/** Libellé lisible d'une transaction GoCardless. */
export function gcLabel(t: GcTransaction): string {
  return (
    t.remittanceInformationUnstructured ||
    (t.remittanceInformationUnstructuredArray || []).join(' ') ||
    t.creditorName ||
    t.debtorName ||
    t.additionalInformation ||
    'Opération bancaire'
  ).trim();
}
