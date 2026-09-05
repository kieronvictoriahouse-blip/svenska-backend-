import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';
import { gocardlessConfigured } from '@/lib/finance/gocardless';
import { stripeConfigured } from '@/lib/finance/stripe-payout';
import { activeProvider, providerHandlesPicker } from '@/lib/finance/provider';

export const dynamic = 'force-dynamic';

// GET — état des connexions + comptes rattachés (panneau « Comptes connectés »).
export async function GET(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const [{ data: connections }, { data: accounts }] = await Promise.all([
    supabaseAdmin.from('bank_connections').select('*').order('created_at', { ascending: false }),
    supabaseAdmin.from('bank_accounts').select('*').order('created_at', { ascending: true }),
  ]);

  const provider = activeProvider();
  return NextResponse.json({
    provider,
    providerHandlesPicker: providerHandlesPicker(provider),
    gocardlessConfigured: gocardlessConfigured(),
    stripeConfigured: stripeConfigured(),
    connections: connections || [],
    accounts: (accounts || []).map(a => ({
      id: a.id,
      name: a.name,
      shortCode: a.short_code,
      iban: a.iban,
      provider: a.provider,
      status: a.status,
      balance: a.balance,
      balanceAt: a.balance_at,
      isPrimary: a.is_primary,
    })),
  });
}
